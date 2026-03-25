/**
 * @module @agentforge/core/config
 *
 * Configuration loading and validation utilities.
 */

export { loadProjectManifest } from './config-loader.js';
export type { StackResolution } from './stack-resolver.js';
export { deriveStackName, resolveStackDir, resolvePromptsDir } from './stack-resolver.js';
export { resolveModelForRole } from './model-resolver.js';
