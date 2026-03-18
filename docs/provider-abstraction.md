# AgentForge LLM Provider Abstraction

## Provider Interface

```typescript
interface LLMProvider {
  readonly name: string;            // "claude", "openai", "gemini", "ollama"
  readonly models: string[];        // all models this provider supports

  /** Request/response mode — simple, for lightweight agents */
  complete(prompt: Prompt, options: CompletionOptions): Promise<Result<CompletionResult, ProviderError>>;

  /** Streaming mode — for code gen, progress visibility, real-time budget enforcement */
  stream(prompt: Prompt, options: CompletionOptions): AsyncIterable<StreamChunk>;

  /** Check availability and rate limit status */
  isAvailable(): Promise<boolean>;

  /** Estimate cost before execution (for governance budget pre-check) */
  estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate;
}
```

## Core Types

```typescript
interface Prompt {
  system: string;                   // System prompt (agent role + conventions)
  messages: Message[];              // Conversation history
  tools?: ToolDefinition[];         // MCP tools available to the agent
}

interface Message {
  role: 'user' | 'assistant' | 'tool_result';
  content: string | ContentBlock[];
}

interface CompletionOptions {
  model: string;                    // REQUIRED — specific model ID ("claude-sonnet-4")
  maxTokens?: number;
  temperature?: number;             // Default: 0 for code gen, 0.7 for design
  stopSequences?: string[];
  budgetLimit?: number;             // USD limit for this call — provider self-enforces
  signal?: AbortSignal;             // Cancel underlying HTTP stream on budget/abort
}

interface CompletionResult {
  content: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  cost: CostRecord;
  model: string;
  latencyMs: number;
  finishReason: 'stop' | 'max_tokens' | 'tool_use';
}

type StreamChunk =
  | { type: 'token'; content: string; tokenCount: number }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'progress'; message: string }
  | { type: 'done'; usage: TokenUsage; cost: CostRecord };

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;         // Tokens served from prompt cache (cheaper)
  cacheWriteTokens?: number;        // Tokens written to prompt cache
}

interface CostRecord {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  model: string;
  timestamp: Date;
}

interface CostEstimate {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  confidence: 'high' | 'medium' | 'low';
}
```

## Tool Types

Claude and OpenAI have different tool calling formats. Providers normalize to this common interface.

```typescript
interface ToolDefinition {
  name: string;                     // MCP tool name
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema for input
}

interface ToolCall {
  id: string;                       // Provider-assigned call ID
  name: string;                     // Tool name
  args: Record<string, unknown>;    // Parsed arguments
}
```

## Error Types

```typescript
type ProviderError =
  | { code: 'RATE_LIMITED'; retryAfterMs: number }
  | { code: 'PROVIDER_DOWN'; status: number; message: string }
  | { code: 'INVALID_RESPONSE'; raw: string }
  | { code: 'AUTH_FAILED'; message: string }
  | { code: 'MODEL_NOT_FOUND'; model: string }
  | { code: 'BUDGET_EXCEEDED_MID_STREAM'; consumed: number; limit: number };
```

## Provider Registry

Providers register via factory functions. Third-party providers (Gemini, Ollama, custom) can register without modifying core code.

```typescript
interface ProviderRegistry {
  /** Register a provider factory by name */
  register(name: string, factory: ProviderFactory): void;

  /** Resolve a provider string like "claude-sonnet-4" -> Claude provider configured for sonnet-4 */
  get(providerString: string): Result<LLMProvider, ProviderError>;

  /** List all registered and available providers */
  listAvailable(): ProviderInfo[];
}

type ProviderFactory = (model: string, config: ProviderConfig) => LLMProvider;

interface ProviderConfig {
  apiKey?: string;                  // From vault or env
  baseUrl?: string;                 // For Ollama or custom endpoints
  timeout?: number;                 // Request timeout in ms
}

interface ProviderInfo {
  name: string;
  models: string[];
  available: boolean;               // API key present and provider reachable
}
```

### Resolution Logic

The registry parses provider strings to extract provider name and model:

```
"claude-sonnet-4"  -> provider: "claude",  model: "claude-sonnet-4"
"gpt-4o-mini"      -> provider: "openai",  model: "gpt-4o-mini"
"ollama/codellama"  -> provider: "ollama",  model: "codellama"
```

Usage in agent runtime:

```typescript
const provider = registry.get(agentContract.provider);
if (!provider.ok) {
  return Err(provider.error);
}

if (agentContract.execution.mode === 'stream') {
  const controller = new AbortController();
  for await (const chunk of provider.value.stream(prompt, { ...options, signal: controller.signal })) {
    // Handle streaming chunks
    // Check budget on each 'token' chunk
    // Call controller.abort() if budget exceeded
  }
} else {
  const result = await provider.value.complete(prompt, options);
}
```

## Phase 1 Providers

### Claude (Anthropic)

- Models: claude-opus-4, claude-sonnet-4, claude-haiku-4
- SDK: @anthropic-ai/sdk
- Streaming: Full support via messages.stream()
- Tool use: Native — map ToolDefinition to Anthropic tool format
- Prompt caching: Supported (track cacheReadTokens/cacheWriteTokens)
- Notes:
  - Tool calls come as content blocks with type "tool_use"
  - Must map to/from common ToolCall format
  - stop_reason "tool_use" maps to finishReason "tool_use"

### OpenAI

- Models: gpt-4o, gpt-4o-mini
- SDK: openai
- Streaming: Full support via stream: true + stream_options: { include_usage: true }
- Tool use: Function calling — different format from Claude, adapter normalizes
- Notes:
  - Tool calls come via message.tool_calls array with function.name and function.arguments (JSON string, must parse)
  - System prompt goes as a separate message with role "system" (not a top-level parameter like Claude)
  - finish_reason "tool_calls" maps to finishReason "tool_use"

### Ollama (Local) — Phase 1 stretch goal

- Models: codellama, mistral, deepseek-coder (configurable)
- Streaming: Full support
- Tool use: Limited (depends on model, degrade gracefully)
- Cost: $0 (local inference, cost tracking still runs but records zero)
- Use for: Scaffolding, boilerplate generation where quality bar is lower
- Notes:
  - Base URL configurable (default: http://localhost:11434)
  - Provider string format: "ollama/codellama"

## Cost Table

Costs per million tokens. Configurable in provider config for when pricing changes.

```typescript
const COST_TABLE: Record<string, { input: number; output: number }> = {
  // Claude
  'claude-opus-4':   { input: 15.00, output: 75.00 },
  'claude-sonnet-4': { input: 3.00,  output: 15.00 },
  'claude-haiku-4':  { input: 0.25,  output: 1.25 },
  // OpenAI
  'gpt-4o':          { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15,  output: 0.60 },
  // Ollama
  'ollama/*':        { input: 0,     output: 0 },
};
```

## Budget Enforcement During Streaming

The agent runtime enforces budgets in real-time during streaming. The provider itself does NOT enforce budgets — that is the governance middleware's responsibility. However, the provider accepts an AbortSignal to allow the runtime to cancel the underlying HTTP connection.

```typescript
// Inside agent runtime, during streaming execution:
let totalCost = 0;
const budgetLimit = agentContract.budget.max_cost_per_task_usd;
const controller = new AbortController();

for await (const chunk of provider.stream(prompt, { ...options, signal: controller.signal })) {
  if (chunk.type === 'token') {
    totalCost += calculateChunkCost(chunk, options.model);

    if (totalCost >= budgetLimit * 0.8) {
      // Warning: approaching budget
      await channels.sendNotification(`Budget alert: ${agentId} at 80%`, 'warning');
    }

    if (totalCost >= budgetLimit) {
      // Hard stop: abort the HTTP stream, not just break the loop
      controller.abort();
      break;
      // Task marked as BUDGET_EXCEEDED, partial output is discarded (never committed)
    }
  }

  if (chunk.type === 'done') {
    // Final cost record for audit log
    await governance.auditLog({ cost: chunk.cost, ... });
  }
}
```

IMPORTANT: `break` alone does NOT stop the HTTP connection. The provider keeps streaming tokens you pay for but ignore. Always use AbortSignal to actually cancel the underlying request. Provider implementations MUST pass the signal to their SDK's HTTP client.

## Integration Points

| Consumer | What It Does With the Stream |
|----------|------------------------------|
| CLI (`--watch`) | Prints tokens to terminal in real-time |
| Slack (progress) | Periodic messages: "Writing tests..." |
| Governance (budget) | Counts tokens, aborts if limit reached |
| Audit log | Records final usage after stream completes |
| Agent learnings | Captures patterns from generated output |

## Adding a New Provider

1. Create `packages/providers/src/<name>/<name>-provider.ts`
2. Implement the `LLMProvider` interface
3. Add cost entries to the cost table
4. Register in the provider registry setup: `registry.register('name', factory)`
5. Export from `packages/providers/src/index.ts`

No changes needed to core, governance, agents, or any other package.
