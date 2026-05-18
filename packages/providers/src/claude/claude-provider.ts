/**
 * @module @agentforge/providers/claude
 *
 * Claude (Anthropic) LLM provider implementation.
 * Uses @anthropic-ai/sdk for API communication.
 */

import Anthropic from '@anthropic-ai/sdk';
import AnthropicVertex from '@anthropic-ai/vertex-sdk';
import { Ok, Err, debugLog, logDefaults } from '@agentforge/core';
import type { Result, CostRecord, CostEstimate } from '@agentforge/core';
import type {
  LLMProvider,
  Prompt,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  ProviderError,
  ProviderConfig,
  ToolCall,
  TokenUsage,
} from '../types.js';
import { calculateCost } from '../cost-table.js';
import { detectVertexConfig } from '../vertex-config.js';

/** Safely extract cache token counts from Anthropic usage. */
function getCacheTokens(usage: Anthropic.Usage): { cacheReadTokens?: number; cacheWriteTokens?: number } {
  return {
    cacheReadTokens: usage.cache_read_input_tokens ?? undefined,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? undefined,
  };
}

const CLAUDE_MODELS = ['claude-opus-4-7', 'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

/**
 * Claude 4.7+ models do not support temperature, top_p, or top_k.
 * Sending non-default values returns a 400 error.
 */
function modelSupportsTemperature(model: string): boolean {
  const resolved = resolveModelId(model);
  return !(/claude-opus-4-[7-9]|claude-opus-[5-9]|claude-sonnet-4-[7-9]|claude-sonnet-[5-9]/).test(resolved);
}

/**
 * Minimal client interface covering what we use from both Anthropic and AnthropicVertex.
 * AnthropicVertex's messages type is Omit<Messages, 'batches'>, which still satisfies this.
 */
interface AnthropicLikeClient {
  messages: Pick<Anthropic['messages'], 'stream' | 'create'>;
}

/** Map short model aliases to full Anthropic API model IDs.
 *  The base IDs (e.g. 'claude-sonnet-4-6') are accepted by the API directly.
 *  Add date-pinned entries here only when you need to lock to a specific snapshot. */
const MODEL_ALIASES: Record<string, string> = {
  // Currently using latest versions — no pinning needed
};

/** Resolve a model name to its API model ID, falling through if already full. */
const resolveModelId = (model: string): string => MODEL_ALIASES[model] ?? model;

/** Map Prompt to Anthropic API message format. */
function toAnthropicMessages(
  prompt: Prompt,
): Anthropic.MessageCreateParams['messages'] {
  return prompt.messages.map((msg) => {
    if (msg.role === 'tool_result') {
      // Tool results need special handling for Anthropic format
      if (typeof msg.content === 'string') {
        return { role: 'user' as const, content: msg.content };
      }
      return {
        role: 'user' as const,
        content: (msg.content).map((block) => {
          if (block.type === 'tool_result') {
            return {
              type: 'tool_result' as const,
              tool_use_id: block.tool_use_id,
              content: block.content,
            };
          }
          return { type: 'text' as const, text: String(block) };
        }),
      };
    }

    if (typeof msg.content === 'string') {
      return { role: msg.role as 'user' | 'assistant', content: msg.content };
    }

    return {
      role: msg.role as 'user' | 'assistant',
      content: (msg.content).map((block) => {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === 'image') {
          return {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: block.source.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: block.source.data,
            },
          };
        }
        if (block.type === 'text') {
          return {
            type: 'text' as const,
            text: block.text,
            ...(block.cache_control ? { cache_control: block.cache_control } : {}),
          };
        }
        return { type: 'text' as const, text: '' };
      }),
    };
  });
}

/** Map Anthropic tool format. */
function toAnthropicTools(
  prompt: Prompt,
): Anthropic.Tool[] | undefined {
  if (!prompt.tools?.length) return undefined;
  return prompt.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool['input_schema'],
  }));
}

/** Map Anthropic finish reason to our format. */
function mapFinishReason(
  stopReason: string | null,
): 'stop' | 'max_tokens' | 'tool_use' {
  switch (stopReason) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    default:
      return 'stop';
  }
}

/** Map Anthropic API errors to ProviderError. */
function mapApiError(error: unknown): ProviderError {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) {
      const rawRetryAfter = error.headers?.['retry-after'];
      const retryAfter = typeof rawRetryAfter === 'string'
        ? parseInt(rawRetryAfter, 10) * 1000
        : 60_000;
      if (typeof rawRetryAfter !== 'string') {
        debugLog('claude.mapApiError: retry-after header missing → default: "60000ms"');
      }
      return { code: 'RATE_LIMITED', retryAfterMs: retryAfter, message: error.message };
    }
    if (error.status === 401 || error.status === 403) {
      return { code: 'AUTH_FAILED', message: error.message };
    }
    if (error.status >= 500) {
      return { code: 'PROVIDER_DOWN', status: error.status, message: error.message };
    }
    return { code: 'PROVIDER_DOWN', status: error.status, message: error.message };
  }
  // Vertex AI wraps quota/rate errors as generic exceptions, not Anthropic.APIError.
  // Detect 429 / RESOURCE_EXHAUSTED in the stringified error.
  const errorStr = String(error);
  if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED') || errorStr.includes('Quota exceeded')) {
    return { code: 'RATE_LIMITED', retryAfterMs: 60_000, message: errorStr };
  }
  return { code: 'INVALID_RESPONSE', raw: errorStr };
}

/**
 * Extract JSON from a response that may contain markdown fences or surrounding text.
 * Tries progressively looser extraction strategies.
 */
function extractJsonFromResponse(text: string): string {
  // Try 1: strip markdown fences (```json ... ``` or ``` ... ```)
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/i);
  if (fenced) return fenced[1].trim();

  // Try 2: simple fence strip (no newline required)
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (stripped !== text.trim()) return stripped;

  // Try 3: find the outermost { ... } or [ ... ]
  const braceMatch = text.match(/(\{[\s\S]*\})/);
  if (braceMatch) return braceMatch[1].trim();
  const bracketMatch = text.match(/(\[[\s\S]*\])/);
  if (bracketMatch) return bracketMatch[1].trim();

  // Fallback: return raw text (let JSON.parse fail with a clear error)
  return text.trim();
}

/** Create the appropriate Anthropic client (direct API or Vertex AI). */
function createAnthropicClient(config: ProviderConfig): { client: AnthropicLikeClient; isVertex: boolean } {
  // If an API key is explicitly provided, always use direct Anthropic API
  if (config.apiKey) {
    debugLog('claude: using direct Anthropic API (apiKey provided)');
    return {
      client: new Anthropic({
        apiKey: config.apiKey,
        ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
        ...(config.timeout ? { timeout: config.timeout } : {}),
      }),
      isVertex: false,
    };
  }

  // Check if Vertex AI is configured (either via ProviderConfig or env vars)
  const vertexConfig = config.projectId ? config : detectVertexConfig();

  if (vertexConfig?.projectId) {
    const region = vertexConfig.region ?? 'us-central1';
    debugLog(`claude: using Vertex AI (project=${vertexConfig.projectId}, region=${region})`);
    return {
      client: new AnthropicVertex({
        projectId: vertexConfig.projectId,
        region,
        ...(vertexConfig.timeout ? { timeout: vertexConfig.timeout } : {}),
      }),
      isVertex: true,
    };
  }

  // No explicit auth — Anthropic SDK will look for ANTHROPIC_API_KEY env var
  debugLog('claude: using direct Anthropic API (no explicit auth — SDK will check env)');
  return {
    client: new Anthropic({
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      ...(config.timeout ? { timeout: config.timeout } : {}),
    }),
    isVertex: false,
  };
}

const STRUCTURED_OUTPUT_TOOL_NAME = '__structured_output';

/**
 * Apply structured output configuration to base params.
 * - Direct API: adds output_config (native, schema-enforced)
 * - Vertex AI: adds a fake tool + forced tool_choice (schema-enforced)
 * - No schema: returns params unchanged
 */
function applyStructuredOutput(
  baseParams: Anthropic.MessageCreateParams,
  schema: Record<string, unknown> | undefined,
  isVertex: boolean,
): Anthropic.MessageCreateParams {
  if (!schema) return baseParams;

  if (!isVertex) {
    // Direct Anthropic API: native output_config
    return {
      ...baseParams,
      output_config: {
        format: { type: 'json_schema' as const, schema },
      },
    } as Anthropic.MessageCreateParams;
  }

  // Vertex AI: use tool_use with forced tool_choice (output_config not supported)
  const structuredTool: Anthropic.Tool = {
    name: STRUCTURED_OUTPUT_TOOL_NAME,
    description: 'Return the structured JSON response conforming to the provided schema.',
    input_schema: schema as Anthropic.Tool['input_schema'],
  };

  return {
    ...baseParams,
    tools: [...(baseParams.tools ?? []), structuredTool],
    tool_choice: { type: 'tool' as const, name: STRUCTURED_OUTPUT_TOOL_NAME },
  };
}

/**
 * Extract structured output, tool calls, and content from an Anthropic response.
 * Separates the fake structured-output tool from real tool calls.
 */
function extractStructuredResult(
  response: Anthropic.Message,
  hasSchema: boolean,
  isVertex: boolean,
): {
  content: string;
  toolCalls: ToolCall[];
  structured?: Record<string, unknown>;
} {
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  const content = textBlocks.map((b) => b.text).join('');

  const toolUseBlocks = response.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );

  // Separate real tool calls from the structured output tool
  let structured: Record<string, unknown> | undefined;
  const realToolBlocks: Anthropic.ToolUseBlock[] = [];

  for (const block of toolUseBlocks) {
    if (hasSchema && isVertex && block.name === STRUCTURED_OUTPUT_TOOL_NAME) {
      structured = block.input as Record<string, unknown>;
    } else {
      realToolBlocks.push(block);
    }
  }

  const toolCalls: ToolCall[] = realToolBlocks.map((b) => ({
    id: b.id,
    name: b.name,
    args: b.input as Record<string, unknown>,
  }));

  // Direct API: structured output comes in text content
  if (hasSchema && !isVertex && content) {
    try {
      structured = JSON.parse(extractJsonFromResponse(content)) as Record<string, unknown>;
    } catch {
      debugLog('claude: failed to parse structured output as JSON');
    }
  }

  return { content, toolCalls, ...(structured !== undefined ? { structured } : {}) };
}

/** Create a Claude LLM provider. */
export function createClaudeProvider(model: string, config: ProviderConfig): LLMProvider {
  const { client, isVertex: usingVertex } = createAnthropicClient(config);

  return {
    name: 'claude',
    models: CLAUDE_MODELS,

    async complete(
      prompt: Prompt,
      options: CompletionOptions,
    ): Promise<Result<CompletionResult, ProviderError>> {
      const startMs = Date.now();

      try {
        // Use streaming internally to avoid SDK timeout on long-running completions.
        // The SDK throws if a non-streaming request takes >10 minutes.
        logDefaults('claude.complete', {
          maxTokens: [options.maxTokens, '4096'],
        });
        const systemParam = typeof prompt.system === 'string'
          ? prompt.system
          : prompt.system.map(block => ({
            type: 'text' as const,
            text: block.text,
            ...(block.cache_control ? { cache_control: block.cache_control } : {}),
          }));

        const includeTemp = options.temperature !== undefined && modelSupportsTemperature(options.model);
        if (options.temperature !== undefined && !includeTemp) {
          debugLog(`claude: stripping temperature=${options.temperature} for ${options.model} (unsupported)`);
        }

        const baseParams: Anthropic.MessageCreateParams = {
          model: resolveModelId(options.model),
          max_tokens: options.maxTokens ?? 4096,
          system: systemParam,
          messages: toAnthropicMessages(prompt),
          ...(includeTemp ? { temperature: options.temperature } : {}),
          ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
          ...(toAnthropicTools(prompt) ? { tools: toAnthropicTools(prompt) } : {}),
          ...(options.toolChoice ? { tool_choice: options.toolChoice as Anthropic.MessageCreateParams['tool_choice'] } : {}),
        };

        const useStructuredOutput = !!options.responseSchema;

        // Apply structured output strategy (output_config or tool_use)
        const finalParams = applyStructuredOutput(
          baseParams,
          options.responseSchema?.schema,
          usingVertex,
        );

        const stream = client.messages.stream(finalParams, { signal: options.signal ?? undefined });
        const response = await stream.finalMessage();

        const latencyMs = Date.now() - startMs;

        // Extract content, tool calls, and structured output
        const { content, toolCalls, structured } = extractStructuredResult(
          response,
          useStructuredOutput,
          usingVertex,
        );

        // Build usage
        const cacheTokens = getCacheTokens(response.usage);
        const usage: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          ...cacheTokens,
        };

        const costData = calculateCost(options.model, usage.inputTokens, usage.outputTokens);
        const cost: CostRecord = {
          ...costData,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          model: options.model,
          timestamp: new Date().toISOString(),
        };

        return Ok({
          content,
          toolCalls,
          usage,
          cost,
          model: options.model,
          latencyMs,
          finishReason: mapFinishReason(response.stop_reason),
          ...(structured !== undefined ? { structured } : {}),
        });
      } catch (error) {
        return Err(mapApiError(error));
      }
    },

    async *stream(
      prompt: Prompt,
      options: CompletionOptions,
    ): AsyncIterable<StreamChunk> {
      try {
        logDefaults('claude.stream', {
          maxTokens: [options.maxTokens, '4096'],
        });
        const streamSystemParam = typeof prompt.system === 'string'
          ? prompt.system
          : prompt.system.map(block => ({
            type: 'text' as const,
            text: block.text,
            ...(block.cache_control ? { cache_control: block.cache_control } : {}),
          }));

        const streamIncludeTemp = options.temperature !== undefined && modelSupportsTemperature(options.model);

        const stream = client.messages.stream(
          {
            model: resolveModelId(options.model),
            max_tokens: options.maxTokens ?? 4096,
            system: streamSystemParam,
            messages: toAnthropicMessages(prompt),
            ...(streamIncludeTemp ? { temperature: options.temperature } : {}),
            ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
            ...(toAnthropicTools(prompt) ? { tools: toAnthropicTools(prompt) } : {}),
            ...(options.toolChoice ? { tool_choice: options.toolChoice as Anthropic.MessageCreateParams['tool_choice'] } : {}),
          },
          {
            signal: options.signal ?? undefined,
          },
        );

        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if ('text' in delta && typeof delta.text === 'string') {
              yield {
                type: 'token',
                content: delta.text,
                tokenCount: Math.ceil(delta.text.length / 4),
              };
            }
            if ('partial_json' in delta && typeof delta.partial_json === 'string') {
              yield { type: 'progress', message: 'Receiving tool arguments...' };
            }
          }

          if (event.type === 'content_block_stop') {
            // Check if we have a completed tool use block
            const snapshot = stream.currentMessage;
            if (snapshot) {
              const lastBlock = snapshot.content[snapshot.content.length - 1];
              if (lastBlock && lastBlock.type === 'tool_use') {
                yield {
                  type: 'tool_call',
                  id: lastBlock.id,
                  name: lastBlock.name,
                  args: lastBlock.input as Record<string, unknown>,
                };
              }
            }
          }

          if (event.type === 'message_stop') {
            const finalMessage = stream.currentMessage;
            if (finalMessage) {
              const streamCacheTokens = getCacheTokens(finalMessage.usage);
              const usage: TokenUsage = {
                inputTokens: finalMessage.usage.input_tokens,
                outputTokens: finalMessage.usage.output_tokens,
                ...streamCacheTokens,
              };

              const costData = calculateCost(options.model, usage.inputTokens, usage.outputTokens);
              yield {
                type: 'done',
                usage,
                cost: {
                  ...costData,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  model: options.model,
                  timestamp: new Date().toISOString(),
                },
              };
            }
          }
        }
      } catch (error) {
        // If aborted, we still need to emit a done chunk
        if (error instanceof Error && error.name === 'AbortError') {
          yield {
            type: 'done',
            usage: { inputTokens: 0, outputTokens: 0 },
            cost: {
              inputCostUsd: 0,
              outputCostUsd: 0,
              totalCostUsd: 0,
              model: options.model,
              timestamp: new Date().toISOString(),
            },
          };
          return;
        }
        throw error;
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        // A lightweight check — attempt to make a tiny request
        await client.messages.create({
          model: resolveModelId('claude-haiku-4-5'),
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        });
        return true;
      } catch {
        return false;
      }
    },

    estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate {
      // Rough estimation: 1 token ≈ 4 characters
      const systemTokens = Math.ceil(prompt.system.length / 4);
      const messageTokens = prompt.messages.reduce((sum, msg) => {
        const len = typeof msg.content === 'string'
          ? msg.content.length
          : JSON.stringify(msg.content).length;
        return sum + Math.ceil(len / 4);
      }, 0);
      const toolTokens = prompt.tools
        ? Math.ceil(JSON.stringify(prompt.tools).length / 4)
        : 0;

      const estimatedInputTokens = systemTokens + messageTokens + toolTokens;
      logDefaults('claude.estimateCost', {
        maxTokens: [options.maxTokens, '4096'],
      });
      const estimatedOutputTokens = options.maxTokens ?? 4096;

      const costData = calculateCost(options.model, estimatedInputTokens, estimatedOutputTokens);

      return {
        estimatedInputTokens,
        estimatedOutputTokens,
        estimatedCostUsd: costData.totalCostUsd,
        confidence: 'medium',
      };
    },
  };
}
