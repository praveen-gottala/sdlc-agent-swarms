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
export type { DesignCollaborationSession } from './ux-design/design-collaboration.js';
export { createDesignCollaborationSession, applyDesignFeedback } from './ux-design/design-collaboration.js';

