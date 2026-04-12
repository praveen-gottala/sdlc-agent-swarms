/**
 * @module @agentforge/cli/commands/design-preflight
 *
 * Shared preflight helper for design commands.
 * Checks design tool connectivity BEFORE any LLM work to avoid wasting
 * API credits when the tool is not connected.
 */

import {
  Ok,
  createPenpotAdapter,
  DEFAULT_SERVICE_URLS,
} from '@agentforge/core';
import type { MCPClient } from '@agentforge/core';
import {
  runPenpotPreflight,
  loadPenpotSession,
} from '@agentforge/agents-ux';
import { errorMsg, warnMsg, infoMsg } from '../formatter.js';

// ============================================================================
// Types
// ============================================================================

export type DesignTool = 'penpot';

export interface PreflightResult {
  readonly mcpClient: MCPClient;
  readonly disconnectFn?: () => void;
}

// ============================================================================
// Setup instructions (shown when preflight fails without --mock)
// ============================================================================

export const PENPOT_SETUP_INSTRUCTIONS = `Penpot MCP not connected. To set up:

  1. Start the Penpot stack:
     docker compose up -d penpot-frontend penpot-mcp

  2. Open Penpot at ${DEFAULT_SERVICE_URLS.penpotUi}

  3. Open a project in the editor

  4. Plugin Manager > install ${DEFAULT_SERVICE_URLS.penpotPluginUi}/manifest.json

  5. Click "CONNECT TO MCP SERVER" in the plugin panel

  6. Re-run this command
`;

// ============================================================================
// No-op MCP client
// ============================================================================

/**
 * Create a no-op MCP client for use when MCP is not needed or deferred.
 *
 * Used in two cases:
 * 1. `--mock` CLI flag: zero-cost pipeline replay without a design tool connection
 * 2. Deferred Penpot connection: browser correction is primary, Penpot export is optional
 */
export const createNoOpMCPClient = (): MCPClient => ({
  callTool: async (_server: string, tool: string) => {
    if (tool === 'execute_code') {
      return Ok({
        content: [{ text: JSON.stringify({ result: { rootId: 'mock-root-id', nodeIds: {} } }) }],
      });
    }
    return Ok({ content: [{ text: '{}' }] });
  },
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

// ============================================================================
// Penpot connection
// ============================================================================

async function runPenpotConnection(
  output: NodeJS.WritableStream,
): Promise<PreflightResult | null> {
  const adapter = createPenpotAdapter();
  const mcpUrl = process.env.AGENTFORGE_MCP_PENPOT_URL ?? DEFAULT_SERVICE_URLS.penpotMcp;

  // Try cached session first, then full preflight
  const sessionResult = loadPenpotSession();
  if (sessionResult.ok) {
    output.write(infoMsg(`  Penpot: reusing session (tools: ${sessionResult.value.supportedTools?.length ?? 0})\n`));
    const handle = adapter.createMCPClient({ url: sessionResult.value.url });
    return { mcpClient: handle.client, disconnectFn: handle.disconnect };
  }

  output.write(infoMsg('  Penpot: running preflight...\n'));
  const preflightResult = await runPenpotPreflight({ mcpUrl });
  if (preflightResult.ok) {
    output.write(infoMsg(`  Penpot: connected (tools: ${preflightResult.value.supportedTools?.length ?? 0})\n`));
    const handle = adapter.createMCPClient({ url: preflightResult.value.url });
    return { mcpClient: handle.client, disconnectFn: handle.disconnect };
  }

  return null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Run design tool preflight and return a connected MCP client.
 *
 * On failure without `--mock`: shows setup instructions and sets `process.exitCode = 1`.
 * On failure with `--mock`: returns a no-op MCP client with a warning.
 */
export async function ensureDesignToolConnection(
  tool: DesignTool,
  output: NodeJS.WritableStream,
  options: { mock?: boolean },
): Promise<PreflightResult | null> {
  if (options.mock) {
    output.write(warnMsg('  Penpot: using no-op MCP (--mock)\n'));
    return { mcpClient: createNoOpMCPClient() };
  }

  const result = await runPenpotConnection(output);

  if (result) {
    return result;
  }

  output.write(errorMsg(PENPOT_SETUP_INSTRUCTIONS));
  process.exitCode = 1;
  return null;
}
