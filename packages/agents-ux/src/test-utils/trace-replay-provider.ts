/**
 * @module @agentforge/agents-ux/test-utils/trace-replay-provider
 *
 * Mock LLM provider that replays recorded prompt traces from disk.
 * Enables running the design pipeline without API keys for:
 * - Fast iteration on downstream stages
 * - CI testing with deterministic outputs
 * - Debugging pipeline issues offline
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

/** Minimal prompt trace shape for replay (matches PromptTrace response fields). */
interface SavedTrace {
  readonly stage: string;
  readonly model: string;
  readonly responseContent?: string;
  readonly responseStructured?: Record<string, unknown>;
  readonly responseToolCalls?: readonly { readonly name: string; readonly args: Record<string, unknown> }[];
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number };
  readonly cost?: { readonly inputCostUsd: number; readonly outputCostUsd: number; readonly totalCostUsd: number };
  readonly latencyMs?: number;
  readonly finishReason?: string;
}

/** A mock CompletionResult matching the provider interface. */
interface MockCompletionResult {
  readonly content: string;
  readonly toolCalls: { name: string; args: Record<string, unknown> }[];
  readonly usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
  readonly cost: { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number; model: string; timestamp: string };
  readonly model: string;
  readonly latencyMs: number;
  readonly finishReason: string;
  readonly structured?: Record<string, unknown>;
}

/** A mock LLM provider that replays saved traces by stage name. */
interface TraceReplayProvider {
  readonly name: string;
  readonly models: string[];
  complete(prompt: unknown, options: { model: string }): Promise<Result<MockCompletionResult>>;
  stream(prompt: unknown, options: { model: string }): AsyncIterable<unknown>;
  estimateCost(prompt: unknown, options: unknown): { inputCostUsd: number; outputCostUsd: number; totalCostUsd: number; model: string; timestamp: string };
}

/**
 * Create a mock LLM provider that replays recorded traces.
 *
 * Loads `pipeline-trace.json` and individual `{stage}-prompt.md` files
 * from the given trace directory to serve cached responses.
 *
 * @param traceDir - Path to the directory containing trace artifacts
 *   (e.g., `.agentforge/previews/session-picker/`)
 * @param stageOrder - Optional array of stage names to replay in order.
 *   When provided, calls are matched by position rather than stage name inference.
 * @returns A mock provider that returns saved responses
 */
export function createTraceReplayProvider(
  traceDir: string,
  stageOrder?: string[],
): TraceReplayProvider {
  // Load pipeline-trace.json for stage metadata
  const pipelineTracePath = join(traceDir, 'pipeline-trace.json');
  let savedTraces: SavedTrace[] = [];

  if (existsSync(pipelineTracePath)) {
    const raw = JSON.parse(readFileSync(pipelineTracePath, 'utf-8')) as {
      stages: Array<{ stage: string; model: string; usage?: SavedTrace['usage']; cost?: { totalCostUsd: number }; latencyMs?: number; finishReason?: string }>;
    };
    savedTraces = raw.stages.map(s => ({
      stage: s.stage,
      model: s.model,
      usage: s.usage,
      cost: s.cost ? { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: s.cost.totalCostUsd } : undefined,
      latencyMs: s.latencyMs,
      finishReason: s.finishReason,
    }));
  }

  // Load response content from individual trace markdown files
  const traceMap = new Map<string, SavedTrace>();
  for (const trace of savedTraces) {
    const mdPath = join(traceDir, `${trace.stage}-prompt.md`);
    if (existsSync(mdPath)) {
      const md = readFileSync(mdPath, 'utf-8');
      // Extract response content from ## LLM Response section
      const responseMatch = /## LLM Response\n\n([\s\S]*?)(?=\n---|\n## |$)/.exec(md);
      const structuredMatch = /## Structured Output\n\n```json\n([\s\S]*?)```/.exec(md);
      const toolCallsMatch = /## Tool Calls\n\n([\s\S]*?)(?=\n---|\n## |$)/.exec(md);

      let responseToolCalls: { name: string; args: Record<string, unknown> }[] | undefined;
      if (toolCallsMatch) {
        const tcJsonMatches = [...toolCallsMatch[1].matchAll(/### (\S+)\n\n```json\n([\s\S]*?)```/g)];
        responseToolCalls = tcJsonMatches.map(m => {
          try {
            return { name: m[1], args: JSON.parse(m[2]) as Record<string, unknown> };
          } catch {
            return { name: m[1], args: {} };
          }
        });
      }

      let responseStructured: Record<string, unknown> | undefined;
      if (structuredMatch) {
        try { responseStructured = JSON.parse(structuredMatch[1]) as Record<string, unknown>; } catch { /* ignore */ }
      }

      traceMap.set(trace.stage, {
        ...trace,
        responseContent: responseMatch?.[1]?.trim(),
        responseStructured,
        responseToolCalls: responseToolCalls?.length ? responseToolCalls : undefined,
      });
    }
  }

  let callIndex = 0;
  const orderedStages = stageOrder ?? savedTraces.map(t => t.stage);

  return {
    name: 'trace-replay',
    models: ['trace-replay'],

    async complete(_prompt: unknown, options: { model: string }): Promise<Result<MockCompletionResult>> {
      // Match by call order
      const stageName = orderedStages[callIndex] ?? `unknown-${callIndex}`;
      callIndex++;

      const trace = traceMap.get(stageName);
      if (!trace || !trace.responseContent) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `No saved trace found for stage "${stageName}" in ${traceDir}`,
          recoverable: false,
        });
      }

      return Ok({
        content: trace.responseContent,
        toolCalls: (trace.responseToolCalls ?? []) as { name: string; args: Record<string, unknown> }[],
        usage: trace.usage ?? { inputTokens: 0, outputTokens: 0 },
        cost: {
          inputCostUsd: trace.cost?.inputCostUsd ?? 0,
          outputCostUsd: trace.cost?.outputCostUsd ?? 0,
          totalCostUsd: trace.cost?.totalCostUsd ?? 0,
          model: options.model,
          timestamp: new Date().toISOString(),
        },
        model: options.model,
        latencyMs: trace.latencyMs ?? 0,
        finishReason: trace.finishReason ?? 'stop',
        structured: trace.responseStructured,
      });
    },

    async *stream(_prompt: unknown, _options: { model: string }): AsyncIterable<unknown> {
      // For stream calls, return the response as a single token chunk + done
      const stageName = orderedStages[callIndex] ?? `unknown-${callIndex}`;
      callIndex++;

      const trace = traceMap.get(stageName);
      const content = trace?.responseContent ?? '';

      yield { type: 'token', content, tokenCount: content.length };
      yield {
        type: 'done',
        usage: trace?.usage ?? { inputTokens: 0, outputTokens: 0 },
        cost: {
          inputCostUsd: trace?.cost?.inputCostUsd ?? 0,
          outputCostUsd: trace?.cost?.outputCostUsd ?? 0,
          totalCostUsd: trace?.cost?.totalCostUsd ?? 0,
          model: 'trace-replay',
          timestamp: new Date().toISOString(),
        },
      };
    },

    estimateCost() {
      return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'trace-replay', timestamp: new Date().toISOString() };
    },
  };
}
