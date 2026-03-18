/**
 * @module @agentforge/core/mcp/secret-manager
 *
 * Secret management for MCP server authentication.
 * Phase 1: reads secrets from environment variables.
 * Interface designed for future vault integration (HashiCorp Vault, AWS Secrets Manager).
 */

import type { Result, AgentForgeError } from '../types/result.js';
import { Ok, Err } from '../types/result.js';

/**
 * Interface for retrieving secrets. Phase 1 implementation reads from
 * environment variables. Drop-in replacements can read from vaults.
 */
export interface SecretProvider {
  /**
   * Retrieve a secret for an MCP server.
   * Returns the secret value or a clear error if not configured.
   * Secrets are NEVER logged, NEVER included in error messages.
   */
  getSecret(server: string, key: string): Result<string>;

  /**
   * Check whether a secret is configured without retrieving the value.
   */
  hasSecret(server: string, key: string): boolean;
}

/**
 * Environment variable naming convention:
 * AGENTFORGE_MCP_{SERVER_NAME}_{KEY}
 *
 * Examples:
 *   AGENTFORGE_MCP_FIGMA_TOKEN
 *   AGENTFORGE_MCP_GITHUB_TOKEN
 *   AGENTFORGE_MCP_SLACK_BOT_TOKEN
 */
const buildEnvKey = (server: string, key: string): string => {
  const normalizedServer = server.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const normalizedKey = key.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return `AGENTFORGE_MCP_${normalizedServer}_${normalizedKey}`;
};

/**
 * Phase 1 secret provider that reads from environment variables.
 * The env object is injectable for testing.
 */
export const createEnvSecretProvider = (
  env: Record<string, string | undefined> = process.env,
): SecretProvider => ({
  getSecret(server: string, key: string): Result<string> {
    const envKey = buildEnvKey(server, key);
    const value = env[envKey];
    if (value === undefined || value === '') {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Secret not configured for MCP server (env: ${envKey}). Set the environment variable to provide authentication.`,
        context: { server, envKey },
        recoverable: false,
      } satisfies AgentForgeError);
    }
    return Ok(value);
  },

  hasSecret(server: string, key: string): boolean {
    const envKey = buildEnvKey(server, key);
    const value = env[envKey];
    return value !== undefined && value !== '';
  },
});
