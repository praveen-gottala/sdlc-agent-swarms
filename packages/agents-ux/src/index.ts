// Exports added as agents are implemented
export type {
  ComponentTreeNode,
  ResponsiveRule,
  ImplementationStage,
  ReviewIssue,
  FigmaCreationStep,
  ComponentSnapshot,
  DesignSnapshotData,
  ScreenDefinition,
  PerScreenResult,
} from './types.js';

// Design Snapshot Capture (shared between Figma and Penpot)
export type { CaptureDesignSnapshotConfig, CaptureScreenshotFn, ExtractPropertiesFn, DesignToolName } from './ux-design/capture-design-snapshot.js';
export { captureDesignSnapshot } from './ux-design/capture-design-snapshot.js';

// UX Dashboard Research
export type { UXDashboardResearchInput, UXDashboardResearchOutput } from './ux-research/ux-dashboard-research.js';
export {
  UX_DASHBOARD_RESEARCH_CONTRACT,
  uxDashboardResearchWork,
  executeUXDashboardResearch,
  registerUXDashboardResearch,
} from './ux-research/ux-dashboard-research.js';

// UX Dashboard Planning
export type { UXDashboardPlanningInput, UXDashboardPlanningOutput } from './ux-planning/ux-dashboard-planning.js';
export {
  UX_DASHBOARD_PLANNING_CONTRACT,
  uxDashboardPlanningWork,
  executeUXDashboardPlanning,
  registerUXDashboardPlanning,
} from './ux-planning/ux-dashboard-planning.js';

// UX Dashboard Implementation
export type {
  UXDashboardImplementationInput,
  UXDashboardImplementationOutput,
  GeneratedFile,
} from './ux-implementation/ux-dashboard-implementation.js';
export {
  UX_DASHBOARD_IMPLEMENTATION_CONTRACT,
  parseImplementationOutput,
  uxDashboardImplementationWork,
  writeImplementationFiles,
  executeUXDashboardImplementation,
  registerUXDashboardImplementation,
} from './ux-implementation/ux-dashboard-implementation.js';

// UX Dashboard Review
export type { UXDashboardReviewInput, UXDashboardReviewOutput } from './ux-review/ux-dashboard-review.js';
export {
  UX_DASHBOARD_REVIEW_CONTRACT,
  parseReviewOutput,
  uxDashboardReviewWork,
  executeUXDashboardReview,
  registerUXDashboardReview,
} from './ux-review/ux-dashboard-review.js';

// UX Dashboard Testing
export type { UXDashboardTestingInput, UXDashboardTestingOutput } from './ux-testing/ux-dashboard-testing.js';
export {
  UX_DASHBOARD_TESTING_CONTRACT,
  parseTestingOutput,
  uxDashboardTestingWork,
  executeUXDashboardTesting,
  registerUXDashboardTesting,
} from './ux-testing/ux-dashboard-testing.js';

// UX Dashboard Design
export type { UXDashboardDesignInput, UXDashboardDesignOutput, StepExecutionResult, ExistingDesignContext } from './ux-design/ux-dashboard-design.js';
export {
  UX_DASHBOARD_DESIGN_CONTRACT,
  parseDesignSteps,
  buildPerScreenPrompt,
  executeDesignSteps,
  uxDashboardDesignWork,
  executeUXDashboardDesign,
  registerUXDashboardDesign,
} from './ux-design/ux-dashboard-design.js';

// Screen Partitioner
export { extractScreenSubtree, inferSingleScreen, flattenTree, groupMissingByScreen, screenGridPosition } from './ux-design/screen-partitioner.js';

// Design Collaboration
export type { DesignCollaborationSession, DesignSystemContext } from './ux-design/design-collaboration.js';
export { createDesignCollaborationSession, applyDesignFeedback, buildDesignSystemContext, buildDesignSystemContextFromSpec, loadDesignSystemPrompt } from './ux-design/design-collaboration.js';

// Figma Screenshot
export type { ScreenshotResult } from './ux-design/figma-screenshot.js';
export { captureFigmaScreenshot, captureFigmaScreenshotViaBridge } from './ux-design/figma-screenshot.js';

// Design Evaluator
export type { DesignIssue, DesignEvaluation, CorrectionHistory, FixAttemptRecord } from './ux-design/design-evaluator.js';
export { evaluateDesign } from './ux-design/design-evaluator.js';

// Design Fixer
export type { FixResult, FixerOptions } from './ux-design/design-fixer.js';
export { executeDesignFixes } from './ux-design/design-fixer.js';

// Correction Loop (shared)
export type { CorrectionAdapter, CorrectionLoopOptions, CorrectionLoopResult, CorrectionFixResult } from './ux-design/correction-loop.js';
export { runCorrectionLoop } from './ux-design/correction-loop.js';

// Design Feedback Loop
export type { FeedbackLoopOptions, FeedbackLoopResult, ReviewCallback, ImplementCallback } from './ux-design/design-feedback-loop.js';
export { runDesignFeedbackLoop, createReviewCallback } from './ux-design/design-feedback-loop.js';

// Param Transforms (shared helper)
export type { ParamTransformContext, TransformResult } from './ux-design/param-transforms.js';
export { resolveAndTransformParams, hexToRgb } from './ux-design/param-transforms.js';

// Figma Preflight
export type { FigmaSession, PreflightOptions, PluginBuildResult } from './scripts/figma-preflight.js';
export { loadFigmaSession, checkWebSocketServer, startFigmaBridgeDocker, ensureFigmaPluginBuilt, runFigmaPreflight, discoverChannels, discoverTools, PLUGIN_DIST_DIR, PLUGIN_MANIFEST_REL } from './scripts/figma-preflight.js';

// Penpot Preflight
export type { PenpotPreflightOptions } from './scripts/penpot-preflight.js';
export { runPenpotPreflight, loadPenpotSession } from './scripts/penpot-preflight.js';

// Penpot Screenshot
export { capturePenpotScreenshot } from './ux-design/penpot-screenshot.js';

// Penpot Design
export type { PenpotDesignInput, PenpotDesignOutput } from './ux-design/ux-penpot-design.js';
export { PENPOT_DESIGN_CONTRACT, parsePenpotDesignScript, penpotDesignWork } from './ux-design/ux-penpot-design.js';

// Penpot Collaboration
export { createPenpotCollaborationSession, createPenpotReviewCallback, mapPenpotToDesignOutput } from './ux-design/penpot-collaboration.js';

// Penpot Browser Agent
export type { PenpotBrowserDesignInput, PenpotBrowserDesignOutput, PenpotBrowserDesignOptions } from './ux-design/penpot-browser-agent.js';
export { PENPOT_BROWSER_DESIGN_CONTRACT, penpotBrowserDesignWork } from './ux-design/penpot-browser-agent.js';

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

