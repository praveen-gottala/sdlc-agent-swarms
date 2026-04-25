export { buildDesignTokensSpec, buildBrandSpec } from './archetypes.js';
export type { DesignArchetype } from './archetypes.js';

export { generateTailwindConfig, generateGlobalCss, hexToHSLChannels } from './tailwind-generator.js';

export {
  DEFAULT_LAYOUT_TOKENS,
  SHARED_LAYOUT,
  DEFAULT_OPACITY,
  DEFAULT_MOTION,
  DEFAULT_STATE,
  DEFAULT_ELEVATION,
  DEFAULT_TYPOGRAPHY_SCALE,
  DEFAULT_PREVIEW,
} from './design-tokens-defaults.js';
export type { PreviewData } from './design-tokens-defaults.js';
