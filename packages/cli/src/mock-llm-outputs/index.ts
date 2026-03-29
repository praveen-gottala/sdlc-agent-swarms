/**
 * @module mock-llm-outputs
 *
 * Mock LLM provider and per-stage canned responses for `--mock` flag.
 * When `--mock` is passed to `design:penpot`, the pipeline uses these
 * pre-recorded outputs instead of making real LLM API calls — enabling
 * instant, deterministic, zero-cost replay for development iteration.
 *
 * NOTE (re: lessons-learned "Mocks Belong Only in Test Files"):
 * This mock is NOT an accidental replacement for a real implementation.
 * It is an explicit user-opted-in development tool activated by `--mock`.
 * Same pattern as `generate-design-options-mock.ts` and `createMockMCPClient`.
 */

import type { LLMProvider, CompletionResult, ProviderError, Prompt, CompletionOptions, StreamChunk } from '@agentforge/providers';
import type { Result, CostEstimate } from '@agentforge/core';
import { mockResearchResult } from './research.js';
import { mockPlanningResult } from './planning.js';
import { mockDesignPenpotV2Result } from './design-penpot-v2.js';

export { mockResearchResult } from './research.js';
export { mockPlanningResult } from './planning.js';
export { mockDesignPenpotV2Result } from './design-penpot-v2.js';

/** Ordered list of mock responses, one per pipeline stage. */
const MOCK_STAGES: ReadonlyArray<{ stage: string; mock: { ok: true; value: CompletionResult } }> = [
  { stage: 'research', mock: mockResearchResult as { ok: true; value: CompletionResult } },
  { stage: 'planning', mock: mockPlanningResult as { ok: true; value: CompletionResult } },
  { stage: 'design-penpot-v2', mock: mockDesignPenpotV2Result as { ok: true; value: CompletionResult } },
];

/**
 * Create a mock LLM provider that returns canned responses in stage order.
 * Each call to `complete()` returns the next stage's mock result.
 * Satisfies the full `LLMProvider` interface so it can be used as a
 * drop-in replacement for `createClaudeProvider()`.
 */
export function createMockLLMProvider(): LLMProvider {
  let callIndex = 0;

  return {
    name: 'mock',
    models: ['mock'],

    async complete(_prompt: Prompt, _options: CompletionOptions): Promise<Result<CompletionResult, ProviderError>> {
      const entry = MOCK_STAGES[callIndex++];
      if (!entry) {
        return {
          ok: false,
          error: {
            code: 'INVALID_RESPONSE' as const,
            raw: `No more mock responses (${callIndex} calls made, ${MOCK_STAGES.length} available)`,
          },
        };
      }
      return entry.mock;
    },

    async *stream(_prompt: Prompt, _options: CompletionOptions): AsyncIterable<StreamChunk> {
      // Mock stream yields a single done chunk with zero usage
      yield {
        type: 'done',
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'mock', timestamp: new Date().toISOString() },
      };
    },

    async isAvailable(): Promise<boolean> {
      return true;
    },

    estimateCost(): CostEstimate {
      return {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        confidence: 'high',
      };
    },
  };
}
