/**
 * @module @agentforge/eval
 *
 * Evaluation framework for the Clarifier pipeline.
 * Provides scenario-based testing with recording/replay,
 * cooperative user simulation, and regression detection.
 */

export type {
  EvalScenario,
  ClarifierMetrics,
  MetricDefinition,
  MetricDirection,
  RecordedCall,
  RunCostSummary,
  RegressionResult,
  ScenarioReport,
  EvalReport,
  EvalError,
} from './types.js';

export {
  EvalScenarioSchema,
  ClarifierMetricsSchema,
  RecordedCallSchema,
  RegressionResultSchema,
  EvalReportSchema,
} from './types.js';

export { createRecordingProvider, clearCassette } from './recording-provider.js';
export type { RecordingProvider, RecordingProviderOptions, RecordingMode } from './recording-provider.js';

export { simulateCooperativeAnswers } from './simulator.js';

export { computeMetrics, METRIC_DEFINITIONS } from './metrics/index.js';

export { loadScenarios, loadScenario, SCENARIO_IDS } from './scenarios/index.js';
export type { ScenarioId } from './scenarios/index.js';

export { runScenario } from './runner.js';
export type { ProgressCallback } from './runner.js';

export { compareToBaseline, hasRegressions } from './baseline/compare.js';

export { buildReport, renderMarkdown, renderJson } from './report.js';
