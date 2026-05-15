// App Spec Generation (Stage 1 unification — Task 4.1)
export type { GeneratedAppSpec, GeneratedPage, GeneratedModel, GeneratedEndpoint } from './app-spec/index.js';
export type { GenerateAppSpecInput, AppSpecError, AppSpecProvider, AppSpecPromptContext } from './app-spec/index.js';
export { generateAppSpec, parseAppSpecResponse, GeneratedAppSpecSchema, buildAppSpecSystemPrompt, buildAppSpecUserPrompt } from './app-spec/index.js';

// Agent output Zod schemas
export {
  UXResearchOutputSchema,
  UXPlanningOutputSchema,
  UXImplementationOutputSchema,
  UXTestingOutputSchema,
  ReviewIssueSchema,
  UXReviewOutputSchema,
  DesignEvaluationOutputSchema,
} from './schemas.js';

// Exports added as agents are implemented
export type {
  ComponentTreeNode,
  ResponsiveRule,
  ImplementationStage,
  ReviewIssue,
  ComponentSnapshot,
  DesignSnapshotData,
  ScreenDefinition,
  UXDesignOutput,
} from './types.js';

// Design Snapshot Capture
export type { CaptureDesignSnapshotConfig, CaptureScreenshotFn, ExtractPropertiesFn, DesignToolName } from './ux-design/capture-design-snapshot.js';
export { captureDesignSnapshot } from './ux-design/capture-design-snapshot.js';

// UX Dashboard Research
export type { UXResearchInput, UXResearchOutput } from './ux-research/ux-research.js';
export {
  UX_RESEARCH_CONTRACT,
  uxResearchWork,
  executeUXResearch,
  registerUXResearch,
} from './ux-research/ux-research.js';

// UX Dashboard Planning
export type { UXPlanningInput, UXPlanningOutput } from './ux-planning/ux-planning.js';
export {
  UX_PLANNING_CONTRACT,
  uxPlanningWork,
  executeUXPlanning,
  registerUXPlanning,
} from './ux-planning/ux-planning.js';

// Prefer `@agentforge/core` for these; kept on the barrel for existing importers.
export { extractValidTokenNames, validateTokenBindings, filterNonTokenBindings } from '@agentforge/core';

// UX Dashboard Implementation
export type {
  UXImplementationInput,
  UXImplementationOutput,
  GeneratedFile,
} from './ux-implementation/ux-implementation.js';
export {
  UX_IMPLEMENTATION_CONTRACT,
  parseImplementationOutput,
  uxImplementationWork,
  writeImplementationFiles,
  executeUXImplementation,
  registerUXImplementation,
} from './ux-implementation/ux-implementation.js';

// UX Dashboard Review
export type { UXReviewInput, UXReviewOutput } from './ux-review/ux-review.js';
export {
  UX_REVIEW_CONTRACT,
  parseReviewOutput,
  uxReviewWork,
  executeUXReview,
  registerUXReview,
} from './ux-review/ux-review.js';

// UX Dashboard Testing
export type { UXTestingInput, UXTestingOutput } from './ux-testing/ux-testing.js';
export {
  UX_TESTING_CONTRACT,
  parseTestingOutput,
  uxTestingWork,
  executeUXTesting,
  registerUXTesting,
} from './ux-testing/ux-testing.js';

// Screen Partitioner
export { extractScreenSubtree, inferSingleScreen, flattenTree, groupMissingByScreen, screenGridPosition } from './ux-design/screen-partitioner.js';

// Design System Context (shared across design tools)
export type { DesignCollaborationSession, DesignSystemContext, DesignChangeRecord } from './ux-design/design-system-context.js';
export { buildDesignSystemContext, buildDesignSystemContextFromSpec, buildComponentCatalogPrompt, matchColorToFamily, buildDesignSystemPromptSection } from './ux-design/design-system-context.js';

// Design Evaluator
export type { DesignIssue, DesignEvaluation, CorrectionHistory, FixAttemptRecord } from './ux-design/design-evaluator.js';
export { evaluateDesign } from './ux-design/design-evaluator.js';

// Structural Quality Gate
export type { StructuralQualityResult } from './ux-design/structural-quality-gate.js';
export { runStructuralQualityGate } from './ux-design/structural-quality-gate.js';

// Correction Loop (shared)
export type { CorrectionAdapter, CorrectionLoopOptions, CorrectionLoopResult, CorrectionFixResult } from './ux-design/correction-loop.js';
export { runCorrectionLoop } from './ux-design/correction-loop.js';

// Design Feedback Loop
export type { FeedbackLoopOptions, FeedbackLoopResult, ReviewCallback, ImplementCallback } from './ux-design/design-feedback-loop.js';
export { runDesignFeedbackLoop } from './ux-design/design-feedback-loop.js';

// Penpot Preflight
export type { PenpotPreflightOptions } from './scripts/penpot-preflight.js';
export { runPenpotPreflight, loadPenpotSession } from './scripts/penpot-preflight.js';

// Penpot Screenshot
export { capturePenpotScreenshot } from './ux-design/penpot-screenshot.js';

// Penpot Design
export type { PenpotDesignInput, PenpotDesignOutput } from './ux-design/ux-penpot-design.js';
export { PENPOT_DESIGN_CONTRACT, parsePenpotDesignScript, penpotDesignWork, exportDesignSpecToPenpot } from './ux-design/ux-penpot-design.js';

// Penpot Collaboration
export { createPenpotCollaborationSession, createPenpotReviewCallback, mapPenpotToDesignOutput } from './ux-design/penpot-collaboration.js';

// Penpot Browser Agent
export type { PenpotBrowserDesignInput, PenpotBrowserDesignOutput, PenpotBrowserDesignOptions } from './ux-design/penpot-browser-agent.js';
export { PENPOT_BROWSER_DESIGN_CONTRACT, penpotBrowserDesignWork } from './ux-design/penpot-browser-agent.js';

// Prototype
export type { ScreenSummary, InteractiveNode, SharedChrome, DesignChromeInput } from './prototype/index.js';
export {
  buildPrototypeManifest,
  extractScreenSummary,
  extractNavigationFromSpecs,
  extractNavigationFromChromeSpec,
  analyzeNavigation,
  resolveSharedComponents,
  designChromeComponents,
  applyFrozenChromeToPageSpec,
  buildSharedChromeFilePayload,
  deriveRegionsFromPageSpec,
  findNodeIdByCatalog,
  findSharedChromeRootNodeId,
  propagateNavigateToChromeTabs,
} from './prototype/index.js';

// Penpot Browser Actions
export type { CanvasScreenshotResult, PenpotShapeState, PenpotShapeInfo, ExportFormat } from './ux-design/penpot-browser-actions.js';
export {
  loginToPenpot,
  navigateToProject,
  createNewProject,
  openPage,
  takeCanvasScreenshot,
  readShapeState,
  zoomToFit,
  toggleGrid,
  exportPage,
  waitForCanvasRender,
  PENPOT_SELECTORS,
} from './ux-design/penpot-browser-actions.js';

// Penpot Browser Correction Adapter
export { createPenpotBrowserCorrectionAdapter } from './ux-design/penpot-browser-adapter.js';

// Penpot Browser Review
export type { PenpotBrowserReviewOptions, PenpotBrowserReviewResult } from './ux-design/penpot-browser-review.js';
export { runPenpotBrowserReview } from './ux-design/penpot-browser-review.js';

// Penpot API Discovery
export { discoverPenpotAPI } from './ux-design/penpot-browser-agent.js';

// Browser Correction Adapter
export { createBrowserCorrectionAdapter } from './ux-design/browser-correction-adapter.js';

// Browser Correction Pipeline
export { runBrowserCorrectionPipeline } from './ux-design/browser-correction-pipeline.js';
export type { BrowserCorrectionResult, BrowserCorrectionOptions } from './ux-design/browser-correction-pipeline.js';

// Page Context
export { formatPageContextPrompt, buildPageContext, resolvePageEntry } from './page-context-prompt.js';

// Design Pipeline (Phase 1 Layer B — unified orchestrator)
export type {
  PipelineTelemetrySink,
  ChromePassConfig,
  PipelineInput,
  DesignPhaseState,
  NodeContext,
  PipelineStageError,
} from './design-pipeline/index.js';
export { pipelineStageError } from './design-pipeline/index.js';
export {
  researchNode,
  planningNode,
  designNode,
  evaluatorNode,
  browserDesignWork,
  buildBrowserDesignUserMessage,
  runDesignPipeline,
} from './design-pipeline/index.js';
export type { PipelinePreset, PipelineRoleKey } from './design-pipeline/index.js';
export { PIPELINE_PRESETS, PIPELINE_ROLE_KEYS, AVAILABLE_MODELS } from './design-pipeline/index.js';

// Shared pipeline factories (M1 Phase 1 — D4, D5)
export type { PipelineContextOptions } from './design-pipeline/index.js';
export { createPipelineContext } from './design-pipeline/index.js';
export type { BuildPipelineInputOptions } from './design-pipeline/index.js';
export { buildPipelineInput } from './design-pipeline/index.js';
export type { RunPagesOptions, PageRunResult, RunPagesResult } from './design-pipeline/index.js';
export { runPagesWithChromePass } from './design-pipeline/index.js';

// Feedback Adapters (Phase 2 Task 2.5 — unified feedback loop)
export type { FeedbackAdapter, DesignSpecPatch } from './feedback/index.js';
export { DesignSpecPatchSchema, BrowserFeedbackAdapter, PenpotFeedbackAdapter, BrowserCollaborationSession, mapBrowserSpecToDesignOutput } from './feedback/index.js';

// Brownfield Import
export type { LLMProvider, LLMToolResult, ImportOptions, PageImportResult } from './ux-import/index.js';
export { collectPageSource, buildImportPrompt, convertPageToDesignSpec, convertAllPages } from './ux-import/index.js';
export { createAnthropicProvider } from './ux-import/index.js';

