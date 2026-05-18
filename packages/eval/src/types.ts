/**
 * @module @agentforge/eval/types
 *
 * Zod schemas and TypeScript types for the eval harness.
 */

import { z } from 'zod';

// ── Metric Direction ──────────────────────────────────────────────────

export type MetricDirection = 'higher-is-better' | 'lower-is-better';

export const MetricDirectionSchema = z.enum(['higher-is-better', 'lower-is-better']);

// ── Clarifier Eval Scenario ───────────────────────────────────────────

export const ClarifierExpectedBehaviorSchema = z.object({
  minQuestions: z.number().int().min(0),
  maxQuestions: z.number().int().min(0),
  expectEscalation: z.boolean(),
  expectMultiRound: z.boolean().optional(),
  expectedTopics: z.array(z.string()).optional(),
});

export const ClarifierEvalScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  rawInput: z.string(),
  mode: z.enum(['bootstrap', 'evolution']),
  maxRounds: z.number().int().min(1),
  maxAnswersPerRound: z.number().int().min(1).optional(),
  expectedBehavior: ClarifierExpectedBehaviorSchema,
});

export type ClarifierEvalScenario = z.infer<typeof ClarifierEvalScenarioSchema>;

/** @deprecated Use ClarifierEvalScenarioSchema */
export const EvalScenarioSchema = ClarifierEvalScenarioSchema;
/** @deprecated Use ClarifierEvalScenario */
export type EvalScenario = ClarifierEvalScenario;
/** @deprecated Use ClarifierExpectedBehaviorSchema */
export const ExpectedBehaviorSchema = ClarifierExpectedBehaviorSchema;

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

export interface MetricDefinition<TMetrics> {
  readonly name: string;
  readonly direction: MetricDirection;
  readonly compute: (metrics: TMetrics) => number | null;
}

export type ClarifierMetricDefinition = MetricDefinition<ClarifierMetrics>;

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

// ── Architect Eval Types ─────────────────────────────────────────────

export const ArchitectExpectedBehaviorSchema = z.object({
  criticShouldPass: z.boolean(),
  expectedFailedGates: z.array(z.string()).optional(),
});

export type ArchitectExpectedBehavior = z.infer<typeof ArchitectExpectedBehaviorSchema>;

export const ArchitectEvalScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  contractBundle: z.record(z.unknown()),
  enrichedRequirement: z.record(z.unknown()),
  existingFiles: z.array(z.string()).optional(),
  expectedBehavior: ArchitectExpectedBehaviorSchema,
});

export type ArchitectEvalScenario = z.infer<typeof ArchitectEvalScenarioSchema>;

export const ArchitectMetricsSchema = z.object({
  scenarioId: z.string(),
  criticPassed: z.boolean(),
  expectedPass: z.boolean(),
  isCorrectVerdict: z.boolean(),
  gateResults: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    findings: z.array(z.string()),
  })),
  falsePositive: z.boolean(),
  falseNegative: z.boolean(),
  taskNodeFieldFindings: z.array(z.string()).optional(),
});

export type ArchitectMetrics = z.infer<typeof ArchitectMetricsSchema>;

// ── Spine Eval Types ─────────────────────────────────────────────────

export const SpinePathSchema = z.enum(['greenfield', 'brownfield']);
export type SpinePath = z.infer<typeof SpinePathSchema>;

export const SpineTaskSelectorSchema = z.object({
  mode: z.enum(['first', 'by-id', 'by-type']),
  taskId: z.string().optional(),
  taskType: z.string().optional(),
  taskMode: z.enum(['NEW', 'MODIFY']).optional(),
});

export type SpineTaskSelector = z.infer<typeof SpineTaskSelectorSchema>;

export const SpineStageExpectationSchema = z.object({
  stage: z.enum(['clarifier', 'architect', 'implementer', 'reviewer']),
  shouldPass: z.boolean(),
  notes: z.string().optional(),
});

export type SpineStageExpectation = z.infer<typeof SpineStageExpectationSchema>;

export const SpineEvalScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  path: SpinePathSchema,
  clarifier: z.object({
    fixtureEnrichedRequirementPath: z.string(),
    fixtureAssumptionLedgerPath: z.string().optional(),
  }),
  architect: z.object({
    mode: z.enum(['greenfield', 'brownfield']),
    existingDesignSpecPaths: z.record(z.string()).optional(),
    taskSelector: SpineTaskSelectorSchema,
  }),
  expectations: z.array(SpineStageExpectationSchema),
});

export type SpineEvalScenario = z.infer<typeof SpineEvalScenarioSchema>;

export const SpineStageCostSchema = z.object({
  stage: z.string(),
  costUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  durationMs: z.number(),
});

export type SpineStageCost = z.infer<typeof SpineStageCostSchema>;

export const SpineEvalResultSchema = z.object({
  scenarioId: z.string(),
  rep: z.number().int(),
  path: SpinePathSchema,
  status: z.enum(['success', 'failed']),
  reviewOutcome: z.enum(['approved', 'rejected', 'escalated']).optional(),
  stageCosts: z.array(SpineStageCostSchema),
  totalCostUsd: z.number(),
  totalDurationMs: z.number(),
  taskId: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.string(),
});

export type SpineEvalResult = z.infer<typeof SpineEvalResultSchema>;
