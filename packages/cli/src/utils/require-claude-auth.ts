/**
 * @module @agentforge/cli/utils/require-claude-auth
 *
 * Shared auth resolution for CLI commands.
 * Validates Claude auth (API key or Vertex AI) and converts to ProviderConfig.
 */

import { resolveClaudeAuth, authResultToProviderConfig } from '@agentforge/providers';
import type { ProviderConfig } from '@agentforge/providers';
import { errorMsg } from '../formatter.js';

const AUTH_ERROR_MSG = 'Claude auth required: set ANTHROPIC_API_KEY or configure Vertex AI (AGENTFORGE_USE_VERTEX=true).\n';

/**
 * Resolve Claude auth and return a ProviderConfig for createClaudeProvider().
 * Writes an error message to output and returns null if no auth is available.
 */
export function requireClaudeAuth(output: NodeJS.WritableStream): ProviderConfig | null {
  const auth = resolveClaudeAuth();
  if (!auth) {
    output.write(errorMsg(AUTH_ERROR_MSG));
    return null;
  }
  return authResultToProviderConfig(auth);
}
