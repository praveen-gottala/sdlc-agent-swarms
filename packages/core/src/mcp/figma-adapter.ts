/**
 * @module @agentforge/core/mcp/figma-adapter
 *
 * Figma implementation of DesignToolAdapter.
 * Wraps existing TalkToFigma WebSocket transport.
 *
 * Supports three connection strategies (tried in order):
 *   1. Env-var override: AGENTFORGE_MCP_FIGMA_WRITE_URL + optional AGENTFORGE_MCP_FIGMA_CHANNEL
 *   2. Cached session: reads .agentforge/figma-session.json
 *   3. Full preflight: Docker startup, plugin build, channel discovery (delegated)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { MCPClient } from './mcp-client.js';
import type {
  DesignToolAdapter,
  DesignToolConnectionConfig,
  DesignToolSession,
  ScreenshotResult,
} from './design-tool-adapter.js';
import { createTalkToFigmaTransport, TALK_TO_FIGMA_TOOLS } from './talk-to-figma-transport.js';
import { DEFAULT_MAX_AGE_MS } from '../constants.js';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_SESSION_PATH = '.agentforge/figma-session.json';

// ============================================================================
// Types
// ============================================================================

/** Logger callback for preflight status messages. */
export type FigmaAdapterLog = (msg: string) => void;

/**
 * Configuration for the Figma adapter.
 * Accepts optional delegate functions for capabilities that require
 * higher-level dependencies (Docker management, plugin build, etc.)
 * which cannot live in core.
 */
export interface FigmaAdapterConfig {
  /**
   * Delegate for full preflight (Docker start, plugin build, channel discovery).
   * Called as Strategy 3 when env-var and session strategies both fail.
   * Typically provided by agents-ux/figma-preflight.ts runFigmaPreflight().
   * The delegate should return a DesignToolSession on success.
   */
  readonly fullPreflight?: (options?: Record<string, unknown>) => Promise<Result<DesignToolSession>>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Discover active channels from the bridge's GET /channels endpoint.
 * Returns channel names that have connected clients.
 * Falls back to empty array if unavailable.
 */
export async function discoverFigmaChannels(bridgeHttpUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${bridgeHttpUrl}/channels`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { channels?: string[] };
    return data.channels ?? [];
  } catch {
    return [];
  }
}

/**
 * Discover supported tools from the bridge's GET /tools endpoint.
 * Returns tool names the bridge supports.
 * Falls back to empty array if unavailable.
 */
export async function discoverFigmaTools(bridgeHttpUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${bridgeHttpUrl}/tools`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];
    const data = await response.json() as { tools?: string[] };
    return data.tools ?? [];
  } catch {
    return [];
  }
}

/** Convert a WebSocket URL to an HTTP URL for the bridge's REST endpoints. */
function wsToHttp(wsUrl: string): string {
  return wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
}

/** Save a session to disk for future reuse. */
function saveFigmaSession(session: DesignToolSession, sessionPath?: string): void {
  const filePath = resolve(process.cwd(), sessionPath ?? DEFAULT_SESSION_PATH);
  const dir = resolve(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(session, null, 2));
}

// ============================================================================
// Adapter factory
// ============================================================================

/**
 * Create a Figma adapter implementing DesignToolAdapter.
 * Wraps the existing TalkToFigma WebSocket bridge.
 *
 * @param config - Optional configuration with delegate functions
 */
export function createFigmaAdapter(config?: FigmaAdapterConfig): DesignToolAdapter {
  return {
    kind: 'figma',
    serverPrefixes: { read: 'figma', write: 'figma-write' },
    tools: TALK_TO_FIGMA_TOOLS,

    createMCPClient(connConfig: DesignToolConnectionConfig): { client: MCPClient; disconnect: () => void } {
      const { connection } = createTalkToFigmaTransport({
        websocketUrl: connConfig.url,
        channel: connConfig.channel,
      });

      const client: MCPClient = {
        callTool: async (_server: string, method: string, params: Readonly<Record<string, unknown>>) => {
          if (!connection.isConnected()) {
            const r = await connection.connect();
            if (!r.ok) return r;
          }
          return connection.callTool(method, params);
        },
        listTools: async (_server: string) => Ok(
          connConfig.supportedTools
            ? TALK_TO_FIGMA_TOOLS.filter(t => connConfig.supportedTools!.includes(t.name))
            : [...TALK_TO_FIGMA_TOOLS]
        ),
        isAvailable: async (_server: string) => connection.isConnected(),
      };

      return { client, disconnect: () => connection.disconnect() };
    },

    async runPreflight(options?: Record<string, unknown>): Promise<Result<DesignToolSession>> {
      const log: FigmaAdapterLog = (options?.log as FigmaAdapterLog) ?? (() => {});
      const pluginWaitMs = (options?.pluginWaitMs as number) ?? 120000;
      const pluginManifestPath = options?.pluginManifestPath as string | undefined;

      // ── Strategy 1: Env-var override ──
      const envWsUrl = process.env.AGENTFORGE_MCP_FIGMA_WRITE_URL;
      const envChannel = process.env.AGENTFORGE_MCP_FIGMA_CHANNEL;

      if (envWsUrl) {
        let channelToUse = envChannel;
        const bridgeHttpUrl = wsToHttp(envWsUrl);

        if (!channelToUse) {
          const channels = await discoverFigmaChannels(bridgeHttpUrl);

          if (channels.length > 0) {
            channelToUse = channels[channels.length - 1];
            log(`Figma bridge: ${envWsUrl} (discovered channel: ${channelToUse})`);
          } else {
            // No channels — plugin not connected. Show instructions and poll.
            if (pluginManifestPath) {
              log('No Figma plugin detected.');
              log('1. Open Figma Desktop');
              log('2. Plugins > Development > Import plugin from manifest...');
              log(`3. Select: ${pluginManifestPath}`);
              log('4. Run the imported plugin and click "Connect"');
            }
            log('Waiting for plugin to connect...');

            const pollStart = Date.now();
            while (Date.now() - pollStart < pluginWaitMs) {
              await new Promise((r) => setTimeout(r, 3000));
              const found = await discoverFigmaChannels(bridgeHttpUrl);
              if (found.length > 0) {
                channelToUse = found[0];
                log(`Figma plugin connected! (channel: ${channelToUse})`);
                break;
              }
              const elapsed = Math.round((Date.now() - pollStart) / 1000);
              log(`Waiting for Figma plugin... (${elapsed}s)`);
            }

            if (!channelToUse) {
              channelToUse = 'agentforge';
              log(`Plugin not detected within ${pluginWaitMs / 1000}s — using fallback channel`);
            }
          }
        } else {
          log(`Figma bridge: ${envWsUrl} (channel: ${channelToUse})`);
        }

        // Discover supported tools from the bridge
        const tools = await discoverFigmaTools(bridgeHttpUrl);
        if (tools.length > 0) {
          log(`Discovered ${tools.length} supported tools from bridge`);
        }

        const session: DesignToolSession = {
          kind: 'figma',
          url: envWsUrl,
          channel: channelToUse,
          connectedAt: new Date().toISOString(),
          supportedTools: tools.length > 0 ? tools : undefined,
        };
        saveFigmaSession(session, options?.sessionPath as string | undefined);
        return Ok(session);
      }

      // ── Strategy 2: Cached session ──
      const sessionResult = this.loadSession(options?.sessionPath as string | undefined);
      if (sessionResult.ok) {
        log(`Figma: reusing session (doc: ${sessionResult.value.documentName ?? 'unknown'})`);
        return sessionResult;
      }

      // ── Strategy 3: Full preflight delegate ──
      if (config?.fullPreflight) {
        log('Figma: running preflight...');
        const preflightResult = await config.fullPreflight(options);
        if (preflightResult.ok) {
          log(`Figma: connected (doc: ${preflightResult.value.documentName ?? 'unknown'})`);
        }
        return preflightResult;
      }

      return Err({
        code: 'INVALID_STATE' as const,
        message: 'No Figma connection available. Set AGENTFORGE_MCP_FIGMA_WRITE_URL or provide a fullPreflight delegate.',
        recoverable: true,
      });
    },

    loadSession(sessionPath?: string): Result<DesignToolSession> {
      const filePath = resolve(process.cwd(), sessionPath ?? DEFAULT_SESSION_PATH);

      if (!existsSync(filePath)) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Figma session file not found: ${filePath}`,
          recoverable: true,
        });
      }

      try {
        const raw = readFileSync(filePath, 'utf-8');
        const session = JSON.parse(raw) as Record<string, unknown>;

        // Support both FigmaSession (wsUrl+channel) and DesignToolSession (url+channel) formats
        const url = (session.wsUrl ?? session.url) as string | undefined;
        const channel = session.channel as string | undefined;
        const connectedAt = session.connectedAt as string | undefined;

        if (!url || !channel || !connectedAt) {
          return Err({
            code: 'INVALID_STATE' as const,
            message: 'Figma session file is missing required fields (wsUrl/url, channel, connectedAt)',
            recoverable: true,
          });
        }

        const age = Date.now() - new Date(connectedAt).getTime();
        if (age > DEFAULT_MAX_AGE_MS) {
          return Err({
            code: 'INVALID_STATE' as const,
            message: `Figma session expired (${Math.round(age / 60000)}min old, max ${Math.round(DEFAULT_MAX_AGE_MS / 60000)}min)`,
            recoverable: true,
          });
        }

        return Ok({
          kind: 'figma',
          url,
          channel,
          connectedAt,
          documentName: session.documentName as string | undefined,
          supportedTools: session.supportedTools as readonly string[] | undefined,
        });
      } catch {
        return Err({
          code: 'INVALID_STATE' as const,
          message: 'Failed to parse Figma session file',
          recoverable: true,
        });
      }
    },

    async captureScreenshot(mcpClient: MCPClient, nodeId: string): Promise<Result<ScreenshotResult>> {
      const exportResult = await mcpClient.callTool('figma', 'export_node_as_image', {
        nodeId,
        format: 'PNG',
        scale: 2,
      });

      if (!exportResult.ok) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma screenshot failed: ${exportResult.error.message}`,
          recoverable: true,
        });
      }

      const result = exportResult.value as Record<string, unknown>;
      const imageData = (result.imageData ?? result.data ?? result.base64 ?? '') as string;
      const imageUrl = (result.imageUrl ?? result.url ?? '') as string;

      if (!imageData && !imageUrl) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Figma export returned no image data',
          recoverable: false,
        });
      }

      if (imageData) {
        const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;
        return Ok({ imageUrl: imageUrl || 'bridge://export', base64 });
      }

      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Failed to fetch image: ${imageResponse.status}`,
            recoverable: true,
          });
        }
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        return Ok({ imageUrl, base64 });
      } catch (err) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Figma screenshot fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          recoverable: true,
        });
      }
    },
  };
}
