/**
 * @module @agentforge/agents-ux/design-collaboration
 *
 * Re-exports from design-system-context.ts for barrel compatibility.
 * The Figma-specific collaboration code has been removed.
 */

export type {
  DesignChangeRecord,
  DesignCollaborationSession,
  DesignSystemContext,
} from './design-system-context.js';

export {
  buildDesignSystemContext,
  buildDesignSystemContextFromSpec,
  buildComponentCatalogPrompt,
  matchColorToFamily,
  buildDesignSystemPromptSection,
} from './design-system-context.js';
