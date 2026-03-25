/**
 * @module @agentforge/core/config
 *
 * Configuration loading and validation utilities.
 */

export { loadProjectManifest } from './config-loader.js';
export type { StackResolution } from './stack-resolver.js';
export { deriveStackName, resolveStackDir, resolvePromptsDir } from './stack-resolver.js';
export { resolveModelForRole } from './model-resolver.js';
export type { ResolveViewportsInput } from './viewport-resolver.js';
export { resolveViewports, STANDARD_BREAKPOINTS_DESKTOP_FIRST, STANDARD_BREAKPOINTS_MOBILE_FIRST } from './viewport-resolver.js';
