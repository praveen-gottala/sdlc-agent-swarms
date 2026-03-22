// Exports added as agents are implemented
export type {
  ComponentTreeNode,
  ResponsiveRule,
  ImplementationStage,
  ReviewIssue,
  FigmaCreationStep,
} from './types.js';

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
export type { UXDashboardDesignInput, UXDashboardDesignOutput } from './ux-design/ux-dashboard-design.js';
export {
  UX_DASHBOARD_DESIGN_CONTRACT,
  parseDesignSteps,
  uxDashboardDesignWork,
  executeUXDashboardDesign,
  registerUXDashboardDesign,
} from './ux-design/ux-dashboard-design.js';

// Design Collaboration
export type { DesignCollaborationSession, DesignSystemContext } from './ux-design/design-collaboration.js';
export { createDesignCollaborationSession, applyDesignFeedback, buildDesignSystemContext, loadDesignSystemPrompt } from './ux-design/design-collaboration.js';

// Figma Screenshot
export type { ScreenshotResult } from './ux-design/figma-screenshot.js';
export { captureFigmaScreenshot } from './ux-design/figma-screenshot.js';

// Design Evaluator
export type { DesignIssue, DesignEvaluation } from './ux-design/design-evaluator.js';
export { evaluateDesign } from './ux-design/design-evaluator.js';

// Design Fixer
export type { FixResult } from './ux-design/design-fixer.js';
export { executeDesignFixes } from './ux-design/design-fixer.js';

// Design Feedback Loop
export type { FeedbackLoopOptions, FeedbackLoopResult, ReviewCallback, ImplementCallback } from './ux-design/design-feedback-loop.js';
export { runDesignFeedbackLoop, createReviewCallback } from './ux-design/design-feedback-loop.js';

// Param Transforms (shared helper)
export type { ParamTransformContext, TransformResult } from './ux-design/param-transforms.js';
export { resolveAndTransformParams, hexToRgb } from './ux-design/param-transforms.js';

// Figma Preflight
export type { FigmaSession, PreflightOptions } from './scripts/figma-preflight.js';
export { loadFigmaSession, checkWebSocketServer, startFigmaBridgeDocker, runFigmaPreflight, discoverChannels } from './scripts/figma-preflight.js';

