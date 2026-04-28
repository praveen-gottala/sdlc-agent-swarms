import type { LLMProvider, Prompt, CompletionOptions, CompletionResult, ProviderError } from '@agentforge/providers';
import type { Result, CostEstimate } from '@agentforge/core';
import { createTracedProvider } from '../traced-provider.js';

function createMockProvider(response?: Partial<CompletionResult>): LLMProvider & { completeCalls: Array<{ prompt: Prompt; options: CompletionOptions }> } {
  const completeCalls: Array<{ prompt: Prompt; options: CompletionOptions }> = [];
  return {
    name: 'mock',
    models: ['test-model'],
    completeCalls,
    async complete(prompt: Prompt, options: CompletionOptions): Promise<Result<CompletionResult, ProviderError>> {
      completeCalls.push({ prompt, options });
      return {
        ok: true,
        value: {
          content: response?.content ?? 'mock response',
          toolCalls: response?.toolCalls ?? [],
          usage: response?.usage ?? { inputTokens: 10, outputTokens: 20 },
          cost: response?.cost ?? { inputCostUsd: 0.001, outputCostUsd: 0.002, totalCostUsd: 0.003, model: 'test', timestamp: new Date().toISOString() },
          model: options.model,
          latencyMs: response?.latencyMs ?? 100,
          finishReason: response?.finishReason ?? 'stop',
        },
      };
    },
    async *stream() { yield { type: 'done' as const, usage: { inputTokens: 0, outputTokens: 0 }, cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'test', timestamp: '' } }; },
    async isAvailable() { return true; },
    estimateCost(): CostEstimate { return { estimatedCostUsd: 0.01, estimatedInputTokens: 80, estimatedOutputTokens: 20, confidence: 'medium' }; },
  };
}

describe('createTracedProvider', () => {
  it('returns provider unchanged when LANGFUSE_SECRET_KEY is not set', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockProvider();
    const traced = createTracedProvider(mock);

    expect(traced).toBe(mock);
  });

  it('preserves name and models from the original provider', () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockProvider();
    const traced = createTracedProvider(mock);

    expect(traced.name).toBe('mock');
    expect(traced.models).toEqual(['test-model']);
  });

  it('delegates complete() to the original provider', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockProvider({ content: 'test output' });
    const traced = createTracedProvider(mock);

    const result = await traced.complete(
      { system: 'You are helpful', messages: [{ role: 'user', content: 'hello' }] },
      { model: 'test-model', maxTokens: 100 },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('test output');
    }
    expect(mock.completeCalls).toHaveLength(1);
  });

  it('passes promptVersion through to the underlying provider in options', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockProvider();
    const traced = createTracedProvider(mock);

    await traced.complete(
      { system: 'sys', messages: [{ role: 'user', content: 'hi' }] },
      { model: 'test-model', promptVersion: '2.1.0' },
    );

    expect(mock.completeCalls).toHaveLength(1);
    expect(mock.completeCalls[0].options.promptVersion).toBe('2.1.0');
  });

  it('delegates isAvailable() and estimateCost()', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const mock = createMockProvider();
    const traced = createTracedProvider(mock);

    expect(await traced.isAvailable()).toBe(true);
    expect(traced.estimateCost(
      { system: 'sys', messages: [] },
      { model: 'test' },
    )).toEqual({ estimatedCostUsd: 0.01, estimatedInputTokens: 80, estimatedOutputTokens: 20, confidence: 'medium' });
  });
});
