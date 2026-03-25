/**
 * @module @agentforge/core/config/model-resolver
 *
 * Resolves the LLM model for a given agent role using a priority chain:
 * 1. AGENTFORGE_DEFAULT_MODEL env var (highest)
 * 2. agentforge.yaml → agents.providers.overrides[role]
 * 3. agentforge.yaml → agents.providers.default
 * 4. Contract's hardcoded provider field (fallback)
 *
 * See ADR-033 for rationale.
 */

import type { ProjectManifest } from '../types/index.js';
import { ENV_MODEL_OVERRIDE } from '../constants.js';

/**
 * Resolve the LLM model for a given agent role.
 *
 * @param role - The agent role (e.g. 'backend_coder', 'spec_writer')
 * @param hardcodedDefault - The contract's provider field (fallback)
 * @param manifest - Optional project manifest with provider configuration
 * @returns The resolved model string
 */
export function resolveModelForRole(
  role: string,
  hardcodedDefault: string,
  manifest?: Pick<ProjectManifest, 'agents'>,
): string {
  // 1. Env var override (highest priority)
  const envOverride = process.env[ENV_MODEL_OVERRIDE];
  if (envOverride && envOverride.length > 0) {
    return envOverride;
  }

  // 2. Per-role override from manifest
  const roleOverride = manifest?.agents?.providers?.overrides?.[role];
  if (roleOverride) {
    return roleOverride;
  }

  // 3. Manifest default
  const manifestDefault = manifest?.agents?.providers?.default;
  if (manifestDefault) {
    return manifestDefault;
  }

  // 4. Contract hardcoded default (fallback)
  return hardcodedDefault;
}
