/**
 * @module @agentforge/agents-ux/scripts/penpot-preflight
 *
 * Pre-flight check for the Penpot MCP server connection.
 * Simpler than Figma preflight — no channel discovery or plugin patching.
 * Checks HTTP health, starts Docker if needed, caches session.
 *
 * Usage (standalone):
 *   npx tsx packages/agents-ux/src/scripts/penpot-preflight.ts
 *
 * Usage (programmatic):
 *   import { runPenpotPreflight } from './penpot-preflight.js';
 *   const session = await runPenpotPreflight();
 */

import type { Result } from '@agentforge/core';
import { createPenpotAdapter } from '@agentforge/core';
import type { DesignToolSession } from '@agentforge/core';

export type { DesignToolSession as PenpotSession };

/** Options for the Penpot preflight check. */
export interface PenpotPreflightOptions {
  /** Penpot MCP server URL. Default: http://localhost:4401/mcp */
  readonly mcpUrl?: string;
  /** Path to session file. Default: .agentforge/penpot-session.json */
  readonly sessionPath?: string;
  /** Repository root for docker compose. Default: process.cwd() */
  readonly repoRoot?: string;
}

/**
 * Run the full Penpot preflight check:
 *
 * 1. Try reusing existing session (< 30 min old)
 * 2. HTTP health check to MCP server
 * 3. If down, start Docker
 * 4. Validate with tools/list
 * 5. Cache session
 */
export async function runPenpotPreflight(
  options?: PenpotPreflightOptions,
): Promise<Result<DesignToolSession>> {
  const adapter = createPenpotAdapter();
  return adapter.runPreflight({
    mcpUrl: options?.mcpUrl,
    sessionPath: options?.sessionPath ?? '.agentforge/penpot-session.json',
    repoRoot: options?.repoRoot,
  });
}

/**
 * Load a cached Penpot session from disk.
 */
export function loadPenpotSession(
  sessionPath?: string,
): Result<DesignToolSession> {
  const adapter = createPenpotAdapter();
  return adapter.loadSession(sessionPath ?? '.agentforge/penpot-session.json');
}

// CLI entry point
if (process.argv[1]?.endsWith('penpot-preflight.ts') || process.argv[1]?.endsWith('penpot-preflight.js')) {
  runPenpotPreflight()
    .then((result) => {
      if (result.ok) {
        // eslint-disable-next-line no-console
        console.log('\n  Penpot preflight complete!');
        // eslint-disable-next-line no-console
        console.log(`  URL: ${result.value.url}`);
        // eslint-disable-next-line no-console
        console.log(`  Tools: ${result.value.supportedTools?.length ?? 0}`);
        process.exit(0);
      } else {
        // eslint-disable-next-line no-console
        console.error(`\n  Penpot preflight failed: ${result.error.message}`);
        process.exit(1);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Unhandled error:', err);
      process.exit(1);
    });
}
