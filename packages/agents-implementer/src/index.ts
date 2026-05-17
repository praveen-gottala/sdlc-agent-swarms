/**
 * @module @agentforge/agents-implementer
 *
 * Implementer pipeline — third spine stage (vision Layer 8).
 * Single-threaded tool-loop consuming TaskPlan + sliced ContractBundle.
 * Invokes design specialist for UI tasks. Emits code artifacts.
 */

// Context assembly (ADR-057 routing)
export { buildImplementerPrompt } from './context/build-implementer-prompt.js';
export type {
  ImplementerPromptInput,
  ImplementerPromptResult,
} from './context/build-implementer-prompt.js';

// Dependency injection
export type { ImplementerDeps, ImplementerNodeFn } from './deps.js';

// Local types
export type { ToolCallRecord, ImplementerArtifact } from './types.js';

// State definition
export { ImplementerStateAnnotation } from './graph/state.js';
export type { ImplementerStateType } from './graph/state.js';

// Graph builder
export {
  buildImplementerGraph,
  compileImplementerGraph,
  routeAfterLoadContext,
} from './graph/implementer-graph.js';

// Node factories
export { createLoadTaskContext } from './graph/nodes/load-task-context.js';
export { createRunDesignSpecialist } from './graph/nodes/run-design-specialist.js';
export { createGenerateCode } from './graph/nodes/generate-code.js';
export { createReportCompletion } from './graph/nodes/report-completion.js';

// Tool set
export { IMPLEMENTER_TOOLS, executeImplementerTool } from './tools/index.js';

// Pipeline runner
export {
  runImplementerPipelineStream,
  runImplementer,
} from './run.js';
export type {
  ImplementerInput,
  ImplementerOutput,
  ImplementerStreamEvent,
  ImplementerError,
} from './run.js';
