/**
 * @module @agentforge/agents-ux/ux-import
 *
 * Brownfield import agent — converts existing React apps to DesignSpec V2.
 */

export type {
  LLMProvider,
  LLMToolResult,
  ImportOptions,
  PageImportResult,
} from './source-to-designspec.js';

export {
  collectPageSource,
  buildImportPrompt,
  convertPageToDesignSpec,
  convertAllPages,
} from './source-to-designspec.js';

export { createAnthropicProvider } from './anthropic-provider.js';

export {
  buildComponentMappingSection,
  buildStylingMappingSection,
  buildColorTokenSection,
  buildTypographySection,
} from './prompt-sections.js';
