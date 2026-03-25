/**
 * @module @agentforge/cli/utils/resolve-cli-model
 *
 * CLI helper that resolves the LLM model using the project manifest
 * and resolveModelForRole from core. Falls back to DEFAULT_MODEL
 * when no manifest is available.
 */

import { loadProjectManifest, resolveModelForRole, DEFAULT_MODEL, createRealFs } from '@agentforge/core';

/**
 * Resolve the model for a CLI command.
 *
 * @param role - Optional agent role for per-role overrides (defaults to 'cli')
 * @param projectRoot - Project root directory (defaults to process.cwd())
 * @returns The resolved model string
 */
export function resolveCLIModel(role = 'cli', projectRoot = process.cwd()): string {
  const manifestResult = loadProjectManifest(projectRoot, createRealFs());
  const manifest = manifestResult.ok ? manifestResult.value : undefined;
  return resolveModelForRole(role, DEFAULT_MODEL, manifest);
}
