import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Ok } from '@agentforge/core';
import type { Result, CostRecord, CostEstimate } from '@agentforge/core';
import type { LLMProvider, Prompt, CompletionOptions, CompletionResult, ProviderError, StreamChunk } from '@agentforge/providers';
import { createRecordingProvider } from './recording-provider.js';

function makeCost(totalCostUsd: number): CostRecord {
  return {
    inputCostUsd: totalCostUsd * 0.7,
    outputCostUsd: totalCostUsd * 0.3,
    totalCostUsd,
    model: 'claude-sonnet-4-6',
    timestamp: '2026-05-02T10:00:00Z',
  };
}

function makeResult(content: string, costUsd: number): CompletionResult {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 100, outputTokens: 50 },
    cost: makeCost(costUsd),
    model: 'claude-sonnet-4-6',
    latencyMs: 500,
    finishReason: 'stop',
  };
}

function createMockProvider(responses: CompletionResult[]): LLMProvider {
  let callIdx = 0;
  return {
    name: 'mock',
    models: ['claude-sonnet-4-6'],
    complete: jest.fn(async (): Promise<Result<CompletionResult, ProviderError>> => {
      const result = responses[callIdx % responses.length]!;
      callIdx++;
      return Ok(result);
    }),
    stream: jest.fn(async function* (): AsyncIterable<StreamChunk> {
      throw new Error('not implemented');
    }),
    isAvailable: jest.fn(async () => true),
    estimateCost: jest.fn((): CostEstimate => ({
      estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'low',
    })),
  };
}

function makePrompt(text: string): Prompt {
  return {
    system: 'You are a test assistant.',
    messages: [{ role: 'user', content: text }],
  };
}

const OPTIONS: CompletionOptions = { model: 'claude-sonnet-4-6' };

describe('RecordingProvider', () => {
  let tempDir: string;
  let cassettePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'eval-test-'));
    cassettePath = join(tempDir, 'cassette.jsonl');
  });

  describe('record mode', () => {
    it('records calls and forwards results from inner provider', async () => {
      const inner = createMockProvider([makeResult('response 1', 0.003)]);
      const provider = createRecordingProvider({ mode: 'record', cassettePath, innerProvider: inner });

      const result = await provider.complete(makePrompt('hello'), OPTIONS);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('response 1');
      }

      const cassette = readFileSync(cassettePath, 'utf-8').trim();
      expect(cassette.split('\n')).toHaveLength(1);
    });

    it('throws if no inner provider', () => {
      expect(() => createRecordingProvider({ mode: 'record', cassettePath }))
        .toThrow('innerProvider');
    });
  });

  describe('replay mode', () => {
    it('replays recorded responses', async () => {
      const inner = createMockProvider([
        makeResult('first', 0.001),
        makeResult('second', 0.002),
      ]);
      const recorder = createRecordingProvider({ mode: 'record', cassettePath, innerProvider: inner });

      await recorder.complete(makePrompt('hello'), OPTIONS);
      await recorder.complete(makePrompt('world'), OPTIONS);

      const replayer = createRecordingProvider({ mode: 'replay', cassettePath });
      const r1 = await replayer.complete(makePrompt('hello'), OPTIONS);
      const r2 = await replayer.complete(makePrompt('world'), OPTIONS);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      if (r1.ok) expect(r1.value.content).toBe('first');
      if (r2.ok) expect(r2.value.content).toBe('second');
    });

    it('returns error on cassette miss', async () => {
      const replayer = createRecordingProvider({ mode: 'replay', cassettePath });
      const result = await replayer.complete(makePrompt('unknown'), OPTIONS);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_RESPONSE');
      }
    });
  });

  describe('cost round-trip', () => {
    it('preserves cost.totalCostUsd through JSON serialization', async () => {
      const inner = createMockProvider([makeResult('cost test', 0.0042)]);
      const recorder = createRecordingProvider({ mode: 'record', cassettePath, innerProvider: inner });
      await recorder.complete(makePrompt('cost'), OPTIONS);

      const replayer = createRecordingProvider({ mode: 'replay', cassettePath });
      const result = await replayer.complete(makePrompt('cost'), OPTIONS);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.cost.totalCostUsd).toBe(0.0042);
        expect(result.value.cost.inputCostUsd).toBeCloseTo(0.0042 * 0.7, 6);
        expect(result.value.cost.outputCostUsd).toBeCloseTo(0.0042 * 0.3, 6);
      }
    });
  });

  describe('replay-twice determinism', () => {
    it('produces identical results from two replays of the same cassette', async () => {
      const responses = [
        makeResult('r1', 0.001),
        makeResult('r2', 0.002),
        makeResult('r3', 0.003),
      ];
      const inner = createMockProvider(responses);
      const recorder = createRecordingProvider({ mode: 'record', cassettePath, innerProvider: inner });

      const prompts = [makePrompt('a'), makePrompt('b'), makePrompt('c')];
      for (const p of prompts) {
        await recorder.complete(p, OPTIONS);
      }

      // First replay
      const replay1 = createRecordingProvider({ mode: 'replay', cassettePath });
      const results1 = [];
      for (const p of prompts) {
        results1.push(await replay1.complete(p, OPTIONS));
      }

      // Second replay
      const replay2 = createRecordingProvider({ mode: 'replay', cassettePath });
      const results2 = [];
      for (const p of prompts) {
        results2.push(await replay2.complete(p, OPTIONS));
      }

      for (let i = 0; i < results1.length; i++) {
        expect(results1[i]!.ok).toBe(true);
        expect(results2[i]!.ok).toBe(true);
        if (results1[i]!.ok && results2[i]!.ok) {
          expect((results1[i] as { ok: true; value: CompletionResult }).value.content)
            .toBe((results2[i] as { ok: true; value: CompletionResult }).value.content);
          expect((results1[i] as { ok: true; value: CompletionResult }).value.cost.totalCostUsd)
            .toBe((results2[i] as { ok: true; value: CompletionResult }).value.cost.totalCostUsd);
        }
      }
    });
  });

  describe('getCostSummary', () => {
    it('aggregates costs across all calls', async () => {
      const inner = createMockProvider([
        makeResult('a', 0.01),
        makeResult('b', 0.02),
        makeResult('c', 0.03),
      ]);
      const recorder = createRecordingProvider({ mode: 'record', cassettePath, innerProvider: inner });

      await recorder.complete(makePrompt('x'), OPTIONS);
      await recorder.complete(makePrompt('y'), OPTIONS);
      await recorder.complete(makePrompt('z'), OPTIONS);

      const summary = recorder.getCostSummary();
      expect(summary.totalCostUsd).toBeCloseTo(0.06, 6);
      expect(summary.callCount).toBe(3);
    });

    it('returns zero for no calls', () => {
      const recorder = createRecordingProvider({
        mode: 'record',
        cassettePath,
        innerProvider: createMockProvider([]),
      });
      const summary = recorder.getCostSummary();
      expect(summary.totalCostUsd).toBe(0);
      expect(summary.callCount).toBe(0);
    });
  });
});
