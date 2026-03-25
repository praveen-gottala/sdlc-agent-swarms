/**
 * @module @agentforge/cli/commands/design-preflight
 *
 * Shared preflight helper for design commands (figma, penpot, penpot:browser).
 * Checks design tool connectivity BEFORE any LLM work to avoid wasting
 * API credits when the tool is not connected.
 */

import { resolve } from 'node:path';
import {
  Ok,
  createFigmaAdapter,
  createPenpotAdapter,
  DEFAULT_SERVICE_URLS,
} from '@agentforge/core';
import type { MCPClient, DesignToolSession } from '@agentforge/core';
import {
  runFigmaPreflight,
  runPenpotPreflight,
  loadPenpotSession,
  PLUGIN_MANIFEST_REL,
} from '@agentforge/agents-ux';
import { errorMsg, warnMsg, infoMsg } from '../formatter.js';

// ============================================================================
// Types
// ============================================================================

export type DesignTool = 'figma' | 'penpot';

export interface PreflightResult {
  readonly mcpClient: MCPClient;
  readonly disconnectFn?: () => void;
}

// ============================================================================
// Setup instructions (shown when preflight fails without --mock)
// ============================================================================

export const FIGMA_SETUP_INSTRUCTIONS = `Figma plugin not connected. To set up:

  1. Start the WebSocket bridge:
     docker compose up -d figma-bridge

  2. Load the plugin in Figma Desktop:
     Plugins > Development > Import plugin from manifest...
     Select: docker/talk-to-figma/figma-plugin/dist/manifest.json

  3. Run the plugin and click "Connect"

  4. Re-run this command
`;

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
// Mock MCP client
// ============================================================================

/** Create a mock MCP client that no-ops all calls. */
export const createMockMCPClient = (): MCPClient => ({
  callTool: async () => Ok({}),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

// ============================================================================
// Figma preflight internals
// ============================================================================

/**
 * Map a FigmaSession (from agents-ux preflight) to a DesignToolSession.
 * The agents-ux preflight returns FigmaSession with `wsUrl` field,
 * while DesignToolAdapter uses `url`.
 */
function mapPreflightToSession(
  preflightResult: { wsUrl: string; channel: string; connectedAt: string; documentName?: string; supportedTools?: readonly string[] },
): DesignToolSession {
  return {
    kind: 'figma',
    url: preflightResult.wsUrl,
    channel: preflightResult.channel,
    connectedAt: preflightResult.connectedAt,
    documentName: preflightResult.documentName,
    supportedTools: preflightResult.supportedTools,
  };
}

async function runFigmaConnection(
  output: NodeJS.WritableStream,
): Promise<PreflightResult | null> {
  const adapter = createFigmaAdapter({
    fullPreflight: async (opts) => {
      const result = await runFigmaPreflight(opts as Record<string, unknown> | undefined);
      if (!result.ok) return result;
      return Ok(mapPreflightToSession(result.value));
    },
  });

  const manifestPath = resolve(process.cwd(), PLUGIN_MANIFEST_REL);
  const preflightResult = await adapter.runPreflight({
    log: (msg: string) => output.write(infoMsg(`  ${msg}\n`)),
    pluginManifestPath: manifestPath,
  });

  if (preflightResult.ok) {
    const session = preflightResult.value;
    const handle = adapter.createMCPClient({
      url: session.url,
      channel: session.channel,
      supportedTools: session.supportedTools as string[] | undefined,
    });
    return { mcpClient: handle.client, disconnectFn: handle.disconnect };
  }

  return null;
}

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
 * On failure without `--mock`: shows tool-specific setup instructions and
 * sets `process.exitCode = 1`.
 *
 * On failure with `--mock`: returns a mock MCP client with a warning.
 *
 * @returns `PreflightResult` on success/mock, `null` on failure (caller should return early)
 */
export async function ensureDesignToolConnection(
  tool: DesignTool,
  output: NodeJS.WritableStream,
  options: { mock?: boolean },
): Promise<PreflightResult | null> {
  // Short-circuit: --mock skips real connection entirely
  if (options.mock) {
    output.write(warnMsg(`  ${tool === 'figma' ? 'Figma' : 'Penpot'}: using mock MCP (--mock)\n`));
    return { mcpClient: createMockMCPClient() };
  }

  const result = tool === 'figma'
    ? await runFigmaConnection(output)
    : await runPenpotConnection(output);

  if (result) {
    return result;
  }

  // Connection failed — show setup instructions and exit
  const instructions = tool === 'figma' ? FIGMA_SETUP_INSTRUCTIONS : PENPOT_SETUP_INSTRUCTIONS;
  output.write(errorMsg(instructions));
  process.exitCode = 1;
  return null;
}
