// Design Surface
export type { DesignSurface, DesignContext, DesignSpec, DesignTokens, DesignChange } from './design-surface.js';

// Figma Adapter
export { FigmaAdapter } from './figma-adapter/figma-adapter.js';

// Page Request Handler
export type { PageRequestInput, PageRequestOutput } from './page-request-handler/page-request-handler.js';
export { handlePageRequest } from './page-request-handler/page-request-handler.js';

// UX Researcher
export type { UXResearcherInput, UXResearcherOutput } from './ux-researcher/ux-researcher.js';
export {
  UX_RESEARCHER_CONTRACT,
  uxResearcherWork,
  executeUXResearcher,
  registerUXResearcher,
} from './ux-researcher/ux-researcher.js';

// Wireframe Generator
export type { WireframeGeneratorInput, WireframeGeneratorOutput } from './wireframe-generator/wireframe-generator.js';
export {
  WIREFRAME_GENERATOR_CONTRACT,
  createWireframeGeneratorWork,
  executeWireframeGenerator,
  registerWireframeGenerator,
} from './wireframe-generator/wireframe-generator.js';

// Visual Designer
export type { VisualDesignerInput, VisualDesignerOutput } from './visual-designer/visual-designer.js';
export {
  VISUAL_DESIGNER_CONTRACT,
  createVisualDesignerWork,
  executeVisualDesigner,
  registerVisualDesigner,
} from './visual-designer/visual-designer.js';

// Design Reviewer
export type { DesignReviewerInput, DesignReviewerOutput } from './design-reviewer/design-reviewer.js';
export {
  DESIGN_REVIEWER_CONTRACT,
  createDesignReviewerWork,
  executeDesignReviewer,
  registerDesignReviewer,
} from './design-reviewer/design-reviewer.js';
