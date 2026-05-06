/**
 * @module @agentforge/agents-clarifier
 *
 * Clarifier pipeline — first spine stage (vision Layer 3).
 * Six-stage conversational clarifier with bootstrap and evolution modes,
 * backed by RAG retrieval and LangGraph StateGraph with HITL interrupts.
 */

// Types
export type {
  ClarifierMode,
  ClarifierState,
  ClarifierContext,
  EscalationDecision,
  Gap,
  Question,
  HumanResponse,
  StructuredOption,
  OptionSource,
  PipelineStageRecord,
  QALogEntry,
} from './types.js';

// Deps
export type { ClarifierDeps, ClarifierNodeFn } from './deps.js';

// Schemas
export {
  GapSchema,
  QuestionSchema,
  ClarifierContextSchema,
  HumanResponseSchema,
  StructuredOptionSchema,
  OptionSourceSchema,
} from './schemas.js';

// Node factories
export {
  createContextRetriever,
  createPrdAnalyzer,
  createGapDetector,
  createQuestionPrioritizer,
  createStoryWriter,
  createCritic,
  createPrdUpdater,
} from './nodes/index.js';

// Graph
export {
  buildClarifierGraph,
  compileClarifierGraph,
  ClarifierStateAnnotation,
  routeAfterCritic,
  routeAfterEscalation,
  routeAfterPrdUpdater,
  routeAfterPrdAnalyzer,
  hasUnresolvedGaps,
} from './graph/index.js';
export type { ClarifierStateType } from './graph/index.js';

// Pipeline runner
export { runClarifierPipeline, runClarifierPipelineStream } from './run.js';
export type { ClarifierInput, ClarifierOutput, ClarifierError, ClarifierStreamEvent } from './run.js';

// Pipeline execution trace
export {
  appendStageRecord,
  appendQALog,
  readExecutionLog,
  readQALog,
  readStageIO,
  readLastSequence,
} from './pipeline-trace.js';
