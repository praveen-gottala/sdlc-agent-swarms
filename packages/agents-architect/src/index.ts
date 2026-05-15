/**
 * @module @agentforge/agents-architect
 *
 * Architect pipeline — second spine stage (vision Layer 3).
 * 7-node sequential LangGraph pipeline + Gate 2 HITL approval interrupt.
 * Consumes EnrichedRequirement, produces ContractBundle.
 */

// Types
export type { RepoSnapshot, RetrievalContext, RetryTarget } from './types.js';

// Deps
export type { ArchitectDeps, ArchitectNodeFn } from './deps.js';

// Context slicer
export { sliceContractBundle, stateCompositionsToBundle } from './context-slicer.js';

// Sizing heuristic
export { estimateTaskTokenBudget } from './sizing-heuristic.js';

// Graph
export {
  ArchitectStateAnnotation,
  buildArchitectGraph,
  compileArchitectGraph,
  createChangeClassifier,
  createContextAssembler,
  createOptionsExplorer,
  createArchitectureWriter,
  createContractDesigner,
  createTaskPlanner,
  createCritic,
  gate2Approval,
  escalationGate,
} from './graph/index.js';
export type { ArchitectStateType } from './graph/index.js';

// Pipeline runner
export { runArchitect, runArchitectPipelineStream } from './run.js';
export type { ArchitectInput, ArchitectOutput, ArchitectError, ArchitectStreamEvent } from './run.js';
