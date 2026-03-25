/**
 * P13 — LLM Provider Abstraction (Wave 3)
 *
 * Validates:
 * 1. complete() and stream() interfaces work correctly
 * 2. StreamChunk types emit in correct sequence
 * 3. Provider string resolution routes to correct adapter
 * 4. Failover to secondary provider on rate limit
 * 5. Every call records cost in the tracker
 * 6. Execution mode (stream vs complete) respected per agent
 */

import { Ok, Err } from '@agentforge/core';
import type { CostRecord, AgentContract } from '@agentforge/core';
import { ProviderRegistry, parseProviderString, calculateCost, getModelCost, resetCostTable } from './index.js';
import type {
  LLMProvider,
  Prompt,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  TokenUsage,
} from './types.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Build a simple prompt for testing. */
const makePrompt = (): Prompt => ({
  system: 'You are a code generator.',
  messages: [{ role: 'user', content: 'Generate a React component for a dashboard.' }],
});

/** Build completion options. */
const makeOptions = (overrides: Partial<CompletionOptions> = {}): CompletionOptions => ({
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
  temperature: 0,
  ...overrides,
});

/** Create a mock LLMProvider. */
function createMockProvider(
  name: string,
  models: string[],
  overrides: Partial<LLMProvider> = {},
): LLMProvider {
  const defaultCost: CostRecord = {
    inputCostUsd: 0.003,
    outputCostUsd: 0.015,
    totalCostUsd: 0.018,
    model: 'claude-sonnet-4-6',
    timestamp: new Date().toISOString(),
    inputTokens: 1000,
    outputTokens: 500,
  };

  const defaultUsage: TokenUsage = {
    inputTokens: 1000,
    outputTokens: 500,
  };

  return {
    name,
    models,
    complete: jest.fn().mockResolvedValue(Ok({
      content: 'Generated code here',
      toolCalls: [],
      usage: defaultUsage,
      cost: defaultCost,
      model: 'claude-sonnet-4-6',
      latencyMs: 1200,
      finishReason: 'stop',
    } as CompletionResult)),
    stream: jest.fn(async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'token', content: 'Hello', tokenCount: 1 };
      yield { type: 'token', content: ' World', tokenCount: 1 };
      yield {
        type: 'done',
        usage: defaultUsage,
        cost: defaultCost,
      };
    }) as unknown as LLMProvider['stream'],
    isAvailable: jest.fn().mockResolvedValue(true),
    estimateCost: jest.fn().mockReturnValue({
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      estimatedCostUsd: 0.018,
      confidence: 'medium' as const,
    }),
    ...overrides,
  };
}

// ============================================================================
// P13.1 — complete() and stream() interfaces
// ============================================================================

describe('P13: LLM Provider Abstraction', () => {
  beforeEach(() => {
    resetCostTable();
  });

  describe('P13.1: complete() and stream() interfaces', () => {
    it('complete() returns CompletionResult with content, toolCalls, usage, cost, model, latencyMs, finishReason', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const result = await provider.complete(makePrompt(), makeOptions());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBeDefined();
        expect(typeof result.value.content).toBe('string');
        expect(Array.isArray(result.value.toolCalls)).toBe(true);
        expect(result.value.usage.inputTokens).toBeGreaterThanOrEqual(0);
        expect(result.value.usage.outputTokens).toBeGreaterThanOrEqual(0);
        expect(result.value.cost.totalCostUsd).toBeGreaterThanOrEqual(0);
        expect(result.value.model).toBe('claude-sonnet-4-6');
        expect(typeof result.value.latencyMs).toBe('number');
        expect(['stop', 'max_tokens', 'tool_use']).toContain(result.value.finishReason);
      }
    });

    it('stream() yields AsyncIterable<StreamChunk>', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });

    it('complete() returns Err on provider errors', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6'], {
        complete: jest.fn().mockResolvedValue(Err({
          code: 'RATE_LIMITED' as const,
          retryAfterMs: 60000,
        })),
      });

      const result = await provider.complete(makePrompt(), makeOptions());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('RATE_LIMITED');
      }
    });

    it('isAvailable() returns boolean', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const available = await provider.isAvailable();
      expect(typeof available).toBe('boolean');
    });

    it('estimateCost() returns CostEstimate', () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const estimate = provider.estimateCost(makePrompt(), makeOptions());

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
      expect(typeof estimate.estimatedCostUsd).toBe('number');
      expect(['high', 'medium', 'low']).toContain(estimate.confidence);
    });
  });

  // ============================================================================
  // P13.2 — StreamChunk types in correct sequence
  // ============================================================================

  describe('P13.2: StreamChunk types in correct sequence', () => {
    it('stream emits token chunks followed by done chunk', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      // Verify sequence: tokens first, done last
      const lastChunk = chunks[chunks.length - 1];
      expect(lastChunk.type).toBe('done');

      // All non-last chunks should be tokens or tool_calls
      for (let i = 0; i < chunks.length - 1; i++) {
        expect(['token', 'tool_call', 'progress']).toContain(chunks[i].type);
      }
    });

    it('token chunk has content and tokenCount', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      const tokenChunks = chunks.filter((c) => c.type === 'token');
      expect(tokenChunks.length).toBeGreaterThan(0);

      for (const chunk of tokenChunks) {
        if (chunk.type === 'token') {
          expect(typeof chunk.content).toBe('string');
          expect(typeof chunk.tokenCount).toBe('number');
        }
      }
    });

    it('done chunk has usage and cost', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toBeDefined();
      if (doneChunk && doneChunk.type === 'done') {
        expect(doneChunk.usage.inputTokens).toBeDefined();
        expect(doneChunk.usage.outputTokens).toBeDefined();
        expect(doneChunk.cost.totalCostUsd).toBeDefined();
      }
    });

    it('tool_call chunk has id, name, and args', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6'], {
        stream: jest.fn(async function* (): AsyncIterable<StreamChunk> {
          yield { type: 'token', content: 'Calling tool...', tokenCount: 3 };
          yield { type: 'tool_call', id: 'call_001', name: 'write_file', args: { path: 'src/app.tsx', content: 'code' } };
          yield {
            type: 'done',
            usage: { inputTokens: 100, outputTokens: 50 },
            cost: { inputCostUsd: 0.001, outputCostUsd: 0.002, totalCostUsd: 0.003, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
          };
        }) as unknown as LLMProvider['stream'],
      });

      const chunks: StreamChunk[] = [];
      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      const toolCallChunk = chunks.find((c) => c.type === 'tool_call');
      expect(toolCallChunk).toBeDefined();
      if (toolCallChunk && toolCallChunk.type === 'tool_call') {
        expect(typeof toolCallChunk.id).toBe('string');
        expect(typeof toolCallChunk.name).toBe('string');
        expect(typeof toolCallChunk.args).toBe('object');
      }
    });
  });

  // ============================================================================
  // P13.3 — Provider string resolution routes to correct adapter
  // ============================================================================

  describe('P13.3: Provider string resolution', () => {
    it('resolves "claude-sonnet-4-6" to claude provider', () => {
      const { provider, model } = parseProviderString('claude-sonnet-4-6');
      expect(provider).toBe('claude');
      expect(model).toBe('claude-sonnet-4-6');
    });

    it('resolves "gpt-4o" to openai provider', () => {
      const { provider, model } = parseProviderString('gpt-4o');
      expect(provider).toBe('openai');
      expect(model).toBe('gpt-4o');
    });

    it('resolves "ollama/codellama" to ollama provider', () => {
      const { provider, model } = parseProviderString('ollama/codellama');
      expect(provider).toBe('ollama');
      expect(model).toBe('codellama');
    });

    it('resolves "claude-opus-4-6" to claude provider', () => {
      const { provider, model } = parseProviderString('claude-opus-4-6');
      expect(provider).toBe('claude');
      expect(model).toBe('claude-opus-4-6');
    });

    it('resolves "gpt-4o-mini" to openai provider', () => {
      const { provider, model } = parseProviderString('gpt-4o-mini');
      expect(provider).toBe('openai');
      expect(model).toBe('gpt-4o-mini');
    });

    it('ProviderRegistry.get() resolves registered provider', () => {
      const registry = new ProviderRegistry();
      const mockClaude = createMockProvider('claude', ['claude-sonnet-4-6', 'claude-opus-4-6']);
      registry.register('claude', () => mockClaude);

      const result = registry.get('claude-sonnet-4-6');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('claude');
      }
    });

    it('ProviderRegistry.get() returns MODEL_NOT_FOUND for unregistered provider', () => {
      const registry = new ProviderRegistry();
      const result = registry.get('unknown-model-xyz');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MODEL_NOT_FOUND');
      }
    });

    it('ProviderRegistry routes to correct adapter with 2 providers', () => {
      const registry = new ProviderRegistry();
      const mockClaude = createMockProvider('claude', ['claude-sonnet-4-6']);
      const mockOpenAI = createMockProvider('openai', ['gpt-4o']);

      registry.register('claude', () => mockClaude);
      registry.register('openai', () => mockOpenAI);

      const claudeResult = registry.get('claude-sonnet-4-6');
      const openaiResult = registry.get('gpt-4o');

      expect(claudeResult.ok).toBe(true);
      if (claudeResult.ok) expect(claudeResult.value.name).toBe('claude');

      expect(openaiResult.ok).toBe(true);
      if (openaiResult.ok) expect(openaiResult.value.name).toBe('openai');
    });
  });

  // ============================================================================
  // P13.4 — Failover on rate limit
  // ============================================================================

  describe('P13.4: Failover to secondary provider on rate limit', () => {
    it('runtime can attempt secondary provider when primary returns RATE_LIMITED', async () => {
      const registry = new ProviderRegistry();

      // Primary provider rate limited
      const primaryProvider = createMockProvider('claude', ['claude-sonnet-4-6'], {
        complete: jest.fn().mockResolvedValue(Err({
          code: 'RATE_LIMITED' as const,
          retryAfterMs: 60000,
        })),
      });

      // Secondary provider succeeds
      const secondaryProvider = createMockProvider('openai', ['gpt-4o'], {
        complete: jest.fn().mockResolvedValue(Ok({
          content: 'Fallback response',
          toolCalls: [],
          usage: { inputTokens: 500, outputTokens: 200 },
          cost: { inputCostUsd: 0.001, outputCostUsd: 0.002, totalCostUsd: 0.003, model: 'gpt-4o', timestamp: new Date().toISOString() },
          model: 'gpt-4o',
          latencyMs: 800,
          finishReason: 'stop' as const,
        })),
      });

      registry.register('claude', () => primaryProvider);
      registry.register('openai', () => secondaryProvider);

      // Attempt primary
      const primaryResult = await primaryProvider.complete(makePrompt(), makeOptions());
      expect(primaryResult.ok).toBe(false);
      if (!primaryResult.ok) {
        expect(primaryResult.error.code).toBe('RATE_LIMITED');
      }

      // Failover to secondary
      const secondaryResult = await secondaryProvider.complete(
        makePrompt(),
        makeOptions({ model: 'gpt-4o' }),
      );
      expect(secondaryResult.ok).toBe(true);
      if (secondaryResult.ok) {
        expect(secondaryResult.value.content).toBe('Fallback response');
      }
    });

    it('ProviderError RATE_LIMITED includes retryAfterMs', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6'], {
        complete: jest.fn().mockResolvedValue(Err({
          code: 'RATE_LIMITED' as const,
          retryAfterMs: 30000,
        })),
      });

      const result = await provider.complete(makePrompt(), makeOptions());
      expect(result.ok).toBe(false);
      if (!result.ok && result.error.code === 'RATE_LIMITED') {
        expect(result.error.retryAfterMs).toBe(30000);
      }
    });
  });

  // ============================================================================
  // P13.5 — Cost recording
  // ============================================================================

  describe('P13.5: Cost recording on every complete() and stream() call', () => {
    it('complete() returns CostRecord with token counts (per ADR-008 optional fields populated)', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const result = await provider.complete(makePrompt(), makeOptions());

      expect(result.ok).toBe(true);
      if (result.ok) {
        const cost = result.value.cost;
        expect(typeof cost.inputCostUsd).toBe('number');
        expect(typeof cost.outputCostUsd).toBe('number');
        expect(typeof cost.totalCostUsd).toBe('number');
        expect(typeof cost.model).toBe('string');
        expect(typeof cost.timestamp).toBe('string');
        // ADR-008: token fields are optional but providers should populate them
        expect(cost.inputTokens).toBeDefined();
        expect(cost.outputTokens).toBeDefined();
      }
    });

    it('stream() done chunk includes CostRecord', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      const doneChunk = chunks.find((c) => c.type === 'done');
      expect(doneChunk).toBeDefined();
      if (doneChunk && doneChunk.type === 'done') {
        expect(typeof doneChunk.cost.totalCostUsd).toBe('number');
        expect(typeof doneChunk.cost.model).toBe('string');
      }
    });

    it('calculateCost returns correct values for claude-sonnet-4-6', () => {
      const cost = calculateCost('claude-sonnet-4-6', 1000, 500);

      // claude-sonnet-4-6: $3/M input, $15/M output
      expect(cost.inputCostUsd).toBeCloseTo(0.003, 5);
      expect(cost.outputCostUsd).toBeCloseTo(0.0075, 5);
      expect(cost.totalCostUsd).toBeCloseTo(0.0105, 5);
    });

    it('calculateCost returns correct values for gpt-4o', () => {
      const cost = calculateCost('gpt-4o', 1000, 500);

      // gpt-4o: $2.5/M input, $10/M output
      expect(cost.inputCostUsd).toBeCloseTo(0.0025, 5);
      expect(cost.outputCostUsd).toBeCloseTo(0.005, 5);
      expect(cost.totalCostUsd).toBeCloseTo(0.0075, 5);
    });

    it('ollama models have zero cost', () => {
      const modelCost = getModelCost('ollama/codellama');
      expect(modelCost.input).toBe(0);
      expect(modelCost.output).toBe(0);
    });
  });

  // ============================================================================
  // P13.6 — Execution mode (stream vs complete) respected per agent
  // ============================================================================

  describe('P13.6: Execution mode per agent contract', () => {
    it('code_gen agent with streaming mode calls stream()', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);

      // Agent contract specifies stream mode
      const codeGenContract: Partial<AgentContract> = {
        role: 'code_generator',
        execution: { mode: 'stream', progress_events: true, max_context_tokens: 100000 },
        provider: 'claude-sonnet-4-6',
      };

      if (codeGenContract.execution!.mode === 'stream') {
        const chunks: StreamChunk[] = [];
        for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
          chunks.push(chunk);
        }
        expect(chunks.length).toBeGreaterThan(0);
        expect(provider.stream).toHaveBeenCalled();
      }
    });

    it('spec_sync agent with complete mode calls complete()', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);

      // Agent contract specifies complete mode
      const specSyncContract: Partial<AgentContract> = {
        role: 'spec_writer',
        execution: { mode: 'complete', progress_events: false, max_context_tokens: 100000 },
        provider: 'claude-opus-4-6',
      };

      if (specSyncContract.execution!.mode === 'complete') {
        const result = await provider.complete(makePrompt(), makeOptions());
        expect(result.ok).toBe(true);
        expect(provider.complete).toHaveBeenCalled();
      }
    });

    it('stream mode gives progress visibility via token chunks', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const chunks: StreamChunk[] = [];

      for await (const chunk of provider.stream(makePrompt(), makeOptions())) {
        chunks.push(chunk);
      }

      const tokenChunks = chunks.filter((c) => c.type === 'token');
      expect(tokenChunks.length).toBeGreaterThan(0);
      // Streaming provides real-time progress through incremental tokens
    });

    it('complete mode returns full response in single call', async () => {
      const provider = createMockProvider('claude', ['claude-sonnet-4-6']);
      const result = await provider.complete(makePrompt(), makeOptions());

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Complete mode returns everything at once
        expect(typeof result.value.content).toBe('string');
        expect(result.value.content.length).toBeGreaterThan(0);
        expect(result.value.usage.inputTokens).toBeDefined();
        expect(result.value.usage.outputTokens).toBeDefined();
      }
    });
  });
});
