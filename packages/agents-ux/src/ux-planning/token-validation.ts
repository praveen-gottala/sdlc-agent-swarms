/**
 * @deprecated Import from `@agentforge/core` instead (e.g. `extractValidTokenNames`, `validateTokenBindings`).
 * This module re-exports the shared implementation for backward compatibility.
 *
 * @module @agentforge/agents-ux/ux-planning/token-validation
 */
export {
  extractValidTokenNames,
  buildTokenAllowlist,
  filterNonTokenBindings,
  validateTokenBindings,
  MAX_TOKEN_BINDING_RETRIES,
  parseTokenBindingsCorrection,
  buildTokenCorrectionPrompt,
  applyDotNotationFallback,
} from '@agentforge/core';
