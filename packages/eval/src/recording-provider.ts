/**
 * @module @agentforge/eval/recording-provider
 *
 * LLMProvider wrapper that records or replays complete() calls.
 * Record mode: forwards to inner provider, saves prompt+response to JSONL cassette.
 * Replay mode: returns recorded responses deterministically by prompt hash + seq.
 */

import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Ok, Err } from '@agentforge/core';
import type { Result, CostRecord, CostEstimate } from '@agentforge/core';
import type {
  LLMProvider,
  Prompt,
  CompletionOptions,
  CompletionResult,
  ProviderError,
  StreamChunk,
} from '@agentforge/providers';
import type { RecordedCall, RunCostSummary } from './types.js';
import { RecordedCallSchema } from './types.js';

export type RecordingMode = 'record' | 'replay';

export interface RecordingProviderOptions {
  readonly mode: RecordingMode;
  readonly cassettePath: string;
  readonly innerProvider?: LLMProvider;
}

/** Provider with cost summary accessor for eval metrics. */
export interface RecordingProvider extends LLMProvider {
  getCostSummary(): RunCostSummary;
}

function hashPrompt(prompt: Prompt, model: string): string {
  const canonical = JSON.stringify({
    system: prompt.system,
    messages: prompt.messages,
    model,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function loadCassette(path: string): RecordedCall[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => RecordedCallSchema.parse(JSON.parse(line)));
}

/**
 * Create a recording/replaying LLM provider for eval.
 */
export function createRecordingProvider(options: RecordingProviderOptions): RecordingProvider {
  const { mode, cassettePath } = options;

  if (mode === 'record' && !options.innerProvider) {
    throw new Error('RecordingProvider in record mode requires an innerProvider');
  }

  let seq = 0;
  const collectedCosts: CostRecord[] = [];

  // For replay: group cassette entries by promptHash+model, track consumption
  const cassetteEntries = mode === 'replay' ? loadCassette(cassettePath) : [];
  const buckets = new Map<string, RecordedCall[]>();
  const bucketCursors = new Map<string, number>();

  for (const entry of cassetteEntries) {
    const key = `${entry.promptHash}:${entry.model}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
    bucketCursors.set(key, 0);
  }

  // Sort each bucket by seq for stable consumption order
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.seq - b.seq);
  }

  const inner = options.innerProvider;
  const models = mode === 'record' ? (inner?.models ?? []) : ['replay'];

  return {
    name: mode === 'record' ? `recording(${inner!.name})` : 'replay',
    models,

    async complete(
      prompt: Prompt,
      completionOptions: CompletionOptions,
    ): Promise<Result<CompletionResult, ProviderError>> {
      const model = completionOptions.model ?? models[0] ?? 'unknown';
      const hash = hashPrompt(prompt, model);

      if (mode === 'record') {
        const result = await inner!.complete(prompt, completionOptions);
        if (result.ok) {
          const entry: RecordedCall = {
            seq: seq++,
            promptHash: hash,
            model,
            timestamp: new Date().toISOString(),
            result: {
              content: result.value.content,
              toolCalls: result.value.toolCalls,
              usage: {
                inputTokens: result.value.usage.inputTokens,
                outputTokens: result.value.usage.outputTokens,
                ...(result.value.usage.cacheReadTokens !== undefined && { cacheReadTokens: result.value.usage.cacheReadTokens }),
                ...(result.value.usage.cacheWriteTokens !== undefined && { cacheWriteTokens: result.value.usage.cacheWriteTokens }),
              },
              cost: {
                inputCostUsd: result.value.cost.inputCostUsd,
                outputCostUsd: result.value.cost.outputCostUsd,
                totalCostUsd: result.value.cost.totalCostUsd,
                model: result.value.cost.model,
                timestamp: result.value.cost.timestamp,
              },
              model: result.value.model,
              latencyMs: result.value.latencyMs,
              finishReason: result.value.finishReason,
              ...(result.value.structured && { structured: result.value.structured }),
            },
          };

          mkdirSync(dirname(cassettePath), { recursive: true });
          appendFileSync(cassettePath, JSON.stringify(entry) + '\n');
          collectedCosts.push(result.value.cost);
        }
        return result;
      }

      // Replay mode
      const key = `${hash}:${model}`;
      const bucket = buckets.get(key);
      if (!bucket) {
        return Err({
          code: 'INVALID_RESPONSE' as const,
          raw: `CASSETTE_MISS: no entries for promptHash=${hash.slice(0, 12)}... model=${model}`,
        });
      }

      const cursor = bucketCursors.get(key) ?? 0;
      if (cursor >= bucket.length) {
        return Err({
          code: 'INVALID_RESPONSE' as const,
          raw: `CASSETTE_MISS: all ${bucket.length} entries consumed for promptHash=${hash.slice(0, 12)}... model=${model}`,
        });
      }

      const entry = bucket[cursor]!;
      bucketCursors.set(key, cursor + 1);

      const completionResult: CompletionResult = {
        content: entry.result.content,
        toolCalls: entry.result.toolCalls as CompletionResult['toolCalls'],
        usage: entry.result.usage,
        cost: entry.result.cost as CostRecord,
        model: entry.result.model,
        latencyMs: entry.result.latencyMs,
        finishReason: entry.result.finishReason,
        ...(entry.result.structured && { structured: entry.result.structured }),
      };

      collectedCosts.push(completionResult.cost);
      return Ok(completionResult);
    },

    stream(): AsyncIterable<StreamChunk> {
      throw new Error('RecordingProvider does not support streaming');
    },

    async isAvailable(): Promise<boolean> {
      if (mode === 'replay') return true;
      return inner!.isAvailable();
    },

    estimateCost(prompt: Prompt, completionOptions: CompletionOptions): CostEstimate {
      if (mode === 'replay') {
        return { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'low' };
      }
      return inner!.estimateCost(prompt, completionOptions);
    },

    getCostSummary(): RunCostSummary {
      return {
        totalCostUsd: collectedCosts.reduce((sum, c) => sum + c.totalCostUsd, 0),
        totalInputTokens: collectedCosts.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0),
        totalOutputTokens: collectedCosts.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0),
        callCount: collectedCosts.length,
      };
    },
  };
}

/** Clear a cassette file for fresh recording. */
export function clearCassette(cassettePath: string): void {
  mkdirSync(dirname(cassettePath), { recursive: true });
  writeFileSync(cassettePath, '');
}
