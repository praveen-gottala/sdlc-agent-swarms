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
export { sliceContractBundle, stateCompositionsToBundle, applyDesignSlice } from './context-slicer.js';
export type { DesignSpecLookup, SlicedBundleWithDesign } from './context-slicer.js';

// Design slice (DesignSliceStrategy resolution)
export { extractLabelsAndBindings, extractStructure } from './design-slice/index.js';

// Sizing heuristic
export {
  estimateTaskTokenBudget,
  MAX_INPUT_TOKEN_BUDGET,
  DESIGN_SLICE_DOWNGRADE_ORDER,
} from './sizing-heuristic.js';

// Graph
export {
  ArchitectStateAnnotation,
  buildArchitectGraph,
  compileArchitectGraph,
  routeAfterCritic,
  getRetryTargetForGate,
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

// Screen impact classifier (R9 §2)
export { classifyScreenImpact } from './impact/screen-impact.js';
export type { ScreenImpactInput, ScreenImpactResult } from './impact/screen-impact.js';

// Pipeline runner
export { runArchitect, runArchitectPipelineStream } from './run.js';
export type { ArchitectInput, ArchitectOutput, ArchitectError, ArchitectStreamEvent } from './run.js';
