/**
 * @module @agentforge/eval
 *
 * Evaluation framework for CHIP pipeline stages.
 * Provides scenario-based testing with recording/replay,
 * cooperative user simulation, and regression detection.
 */

export type {
  ClarifierEvalScenario,
  EvalScenario,
  ClarifierMetrics,
  MetricDefinition,
  ClarifierMetricDefinition,
  MetricDirection,
  RecordedCall,
  RunCostSummary,
  RegressionResult,
  ScenarioReport,
  EvalReport,
  EvalError,
  ArchitectExpectedBehavior,
  ArchitectEvalScenario,
  ArchitectMetrics,
} from './types.js';

export {
  ClarifierEvalScenarioSchema,
  EvalScenarioSchema,
  ClarifierMetricsSchema,
  RecordedCallSchema,
  RegressionResultSchema,
  EvalReportSchema,
  ArchitectExpectedBehaviorSchema,
  ArchitectEvalScenarioSchema,
  ArchitectMetricsSchema,
} from './types.js';

export { createRecordingProvider, clearCassette } from './recording-provider.js';
export type { RecordingProvider, RecordingProviderOptions, RecordingMode } from './recording-provider.js';

export { simulateCooperativeAnswers } from './simulator.js';

export { computeMetrics, CLARIFIER_METRIC_DEFINITIONS, METRIC_DEFINITIONS } from './metrics/index.js';
export { computeArchitectMetrics, ARCHITECT_METRIC_DEFINITIONS } from './metrics/index.js';

export { loadScenarios, loadScenario, SCENARIO_IDS } from './scenarios/index.js';
export type { ScenarioId } from './scenarios/index.js';

export { loadArchitectScenarios, loadArchitectScenario, ARCHITECT_SCENARIO_IDS } from './scenarios/architect/index.js';
export type { ArchitectScenarioId } from './scenarios/architect/index.js';

export { runScenario } from './runner.js';
export type { ProgressCallback } from './runner.js';

export { runArchitectScenario, runArchitectScenarioDetailed } from './architect-runner.js';

export { compareToBaseline, hasRegressions } from './baseline/compare.js';

export { buildReport, renderMarkdown, renderJson } from './report.js';
