/**
 * @module @agentforge/eval/types
 *
 * Zod schemas and TypeScript types for the eval harness.
 */

import { z } from 'zod';

// ── Metric Direction ──────────────────────────────────────────────────

export type MetricDirection = 'higher-is-better' | 'lower-is-better';

export const MetricDirectionSchema = z.enum(['higher-is-better', 'lower-is-better']);

// ── Eval Scenario ─────────────────────────────────────────────────────

export const ExpectedBehaviorSchema = z.object({
  minQuestions: z.number().int().min(0),
  maxQuestions: z.number().int().min(0),
  expectEscalation: z.boolean(),
  expectMultiRound: z.boolean().optional(),
  expectedTopics: z.array(z.string()).optional(),
});

export const EvalScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rawInput: z.string(),
  mode: z.enum(['bootstrap', 'evolution']),
  maxRounds: z.number().int().min(1),
  maxAnswersPerRound: z.number().int().min(1).optional(),
  expectedBehavior: ExpectedBehaviorSchema,
});

export type EvalScenario = z.infer<typeof EvalScenarioSchema>;

// ── Run Cost Summary ──────────────────────────────────────────────────

export const RunCostSummarySchema = z.object({
  totalCostUsd: z.number(),
  totalInputTokens: z.number(),
  totalOutputTokens: z.number(),
  callCount: z.number().int(),
});

export type RunCostSummary = z.infer<typeof RunCostSummarySchema>;

// ── Clarifier Metrics ─────────────────────────────────────────────────

export const ClarifierMetricsSchema = z.object({
  scenarioId: z.string(),
  threadId: z.string(),
  totalQuestions: z.number().int(),
  roundCount: z.number().int(),
  gapOverlapRatio: z.number(),
  prdDiffBytes: z.number().nullable(),
  prdHashEqualAcrossRounds: z.boolean().nullable(),
  totalCostUsd: z.number(),
  durationMs: z.number(),
});

export type ClarifierMetrics = z.infer<typeof ClarifierMetricsSchema>;

// ── Metric Definition ─────────────────────────────────────────────────

export interface MetricDefinition {
  readonly name: string;
  readonly direction: MetricDirection;
  readonly compute: (metrics: ClarifierMetrics) => number | null;
}

// ── Recorded Call (cassette entry) ────────────────────────────────────

export const RecordedCallSchema = z.object({
  seq: z.number().int(),
  promptHash: z.string(),
  model: z.string(),
  timestamp: z.string(),
  result: z.object({
    content: z.string(),
    toolCalls: z.array(z.unknown()),
    usage: z.object({
      inputTokens: z.number(),
      outputTokens: z.number(),
      cacheReadTokens: z.number().optional(),
      cacheWriteTokens: z.number().optional(),
    }),
    cost: z.object({
      inputCostUsd: z.number(),
      outputCostUsd: z.number(),
      totalCostUsd: z.number(),
      model: z.string(),
      timestamp: z.string(),
    }),
    model: z.string(),
    latencyMs: z.number(),
    finishReason: z.enum(['stop', 'max_tokens', 'tool_use']),
    structured: z.record(z.unknown()).optional(),
  }),
});

export type RecordedCall = z.infer<typeof RecordedCallSchema>;

// ── Regression Result ─────────────────────────────────────────────────

export const RegressionResultSchema = z.object({
  metricName: z.string(),
  direction: MetricDirectionSchema,
  baseline: z.number(),
  current: z.number(),
  regressed: z.boolean(),
  deltaPct: z.number(),
});

export type RegressionResult = z.infer<typeof RegressionResultSchema>;

// ── Eval Report ───────────────────────────────────────────────────────

export const ScenarioReportSchema = z.object({
  scenarioId: z.string(),
  metrics: ClarifierMetricsSchema,
  regressions: z.array(RegressionResultSchema),
});

export const EvalReportSchema = z.object({
  timestamp: z.string(),
  scenarios: z.array(ScenarioReportSchema),
  totalCost: RunCostSummarySchema,
  hasRegressions: z.boolean(),
});

export type ScenarioReport = z.infer<typeof ScenarioReportSchema>;
export type EvalReport = z.infer<typeof EvalReportSchema>;

// ── Eval Error ────────────────────────────────────────────────────────

export interface EvalError {
  readonly code: 'GRAPH_ERROR' | 'CHECKPOINTER_ERROR' | 'TIMEOUT' | 'CASSETTE_MISS' | 'SCENARIO_LOAD_ERROR';
  readonly message: string;
}
