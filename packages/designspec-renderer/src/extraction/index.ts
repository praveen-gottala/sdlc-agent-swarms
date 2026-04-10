/**
 * @module @agentforge/designspec-renderer/extraction
 *
 * Source intelligence extraction for brownfield React app import.
 * Deterministic analysis — zero LLM cost.
 */

export type {
  Framework,
  ComponentLibraryId,
  StylingApproach,
  DetectedStack,
  RouteInfo,
  ComponentUsage,
  CSSVariable,
  SourceIntelligence,
} from './types.js';

export { detectStack } from './detect-stack.js';
export { discoverRoutes } from './discover-routes.js';
export { extractCSSVariables } from './extract-css-variables.js';
export { scanComponentUsage } from './scan-component-usage.js';
