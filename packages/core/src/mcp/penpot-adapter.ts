/**
 * @module @agentforge/core/mcp/penpot-adapter
 *
 * Penpot implementation of DesignToolAdapter.
 * Uses HTTP/SSE transport to the Penpot MCP server.
 * Tools are discovered dynamically at connection time.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { MCPClient } from './mcp-client.js';
import type { ToolDefinition } from './mcp-client.js';
import type {
  DesignToolAdapter,
  DesignToolConnectionConfig,
  DesignToolSession,
  ScreenshotResult,
} from './design-tool-adapter.js';
import { createPenpotConnection } from './penpot-transport.js';
import { DEFAULT_MAX_AGE_MS, DEFAULT_SERVICE_URLS } from '../constants.js';

const DEFAULT_SESSION_PATH = '.agentforge/penpot-session.json';

/**
 * Create a Penpot adapter implementing DesignToolAdapter.
 * Tools are discovered dynamically from the MCP server.
 */
export function createPenpotAdapter(): DesignToolAdapter {
  let discoveredTools: readonly ToolDefinition[] = [];

  return {
    kind: 'penpot',
    serverPrefixes: { read: 'penpot', write: 'penpot' },

    get tools(): readonly ToolDefinition[] {
      return discoveredTools;
    },

    createMCPClient(config: DesignToolConnectionConfig): { client: MCPClient; disconnect: () => void } {
      const connection = createPenpotConnection({ mcpUrl: config.url });

      const client: MCPClient = {
        callTool: async (_server: string, method: string, params: Readonly<Record<string, unknown>>) => {
          return connection.callTool(method, params);
        },
        listTools: async (_server: string) => {
          const result = await connection.discoverTools();
          if (result.ok) {
            discoveredTools = result.value;
          }
          return result;
        },
        isAvailable: async (_server: string) => {
          const health = await connection.healthCheck();
          return health.ok;
        },
      };

      return { client, disconnect: () => connection.disconnect() };
    },

    async runPreflight(options?: Record<string, unknown>): Promise<Result<DesignToolSession>> {
      const mcpUrl = (options?.mcpUrl as string) ?? process.env.AGENTFORGE_MCP_PENPOT_URL ?? DEFAULT_SERVICE_URLS.penpotMcp;
      const sessionPath = (options?.sessionPath as string) ?? DEFAULT_SESSION_PATH;

      // 1. Check cached session + verify plugin is still connected
      const existing = this.loadSession(sessionPath);
      if (existing.ok) {
        const cachedConn = createPenpotConnection({ mcpUrl: existing.value.url });
        const health = await cachedConn.healthCheck();
        if (health.ok) {
          // Verify plugin is still connected before reusing
          const pluginCheck = await cachedConn.callTool('execute_code', {
            code: 'return penpot.currentPage?.name ?? null',
          });
          const pluginOk = pluginCheck.ok && (() => {
            const content = pluginCheck.value as { content?: Array<{ text?: string }> };
            const text = Array.isArray(content.content) ? content.content.map(c => c.text ?? '').join('') : '';
            try { return (JSON.parse(text) as { result?: unknown }).result != null; } catch { return false; }
          })();

          if (pluginOk) {
            // eslint-disable-next-line no-console
            console.log(`  [preflight] Reusing Penpot session (doc: ${existing.value.documentName ?? 'unknown'})`);
            const toolsResult = await cachedConn.discoverTools();
            if (toolsResult.ok) {
              discoveredTools = toolsResult.value;
            }
            cachedConn.disconnect();
            return existing;
          }
          // eslint-disable-next-line no-console
          console.log('  [preflight] Cached session valid but plugin not connected, re-running preflight...');
        } else {
          // eslint-disable-next-line no-console
          console.log('  [preflight] Cached Penpot session invalid, reconnecting...');
        }
        cachedConn.disconnect();
      }

      // 2. Health check
      const connection = createPenpotConnection({ mcpUrl });
      let health = await connection.healthCheck();

      if (!health.ok) {
        // 3. Try starting Docker
        // eslint-disable-next-line no-console
        console.log('  [preflight] Penpot MCP not running, starting Docker (Penpot + MCP)...');
        try {
          const { execSync } = await import('node:child_process');
          const repoRoot = (options?.repoRoot as string) ?? process.cwd();
          // Start both Penpot app and MCP server — Penpot services are dependencies
          execSync('docker compose up -d penpot-frontend penpot-mcp', {
            cwd: repoRoot,
            stdio: 'pipe',
            timeout: 120000,
          });
          // eslint-disable-next-line no-console
          console.log(`  [preflight] Penpot UI: ${DEFAULT_SERVICE_URLS.penpotUi}`);
          // eslint-disable-next-line no-console
          console.log(`  [preflight] Penpot MCP Plugin UI: ${DEFAULT_SERVICE_URLS.penpotPluginUi}`);
          // Wait for MCP server to become ready
          await new Promise((res) => setTimeout(res, 8000));
          health = await connection.healthCheck();
        } catch (err) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Failed to start Penpot MCP Docker: ${err instanceof Error ? err.message : String(err)}`,
            recoverable: true,
          });
        }

        if (!health.ok) {
          connection.disconnect();
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Penpot MCP not reachable at ${mcpUrl} after Docker start`,
            recoverable: true,
          });
        }
      }

      // eslint-disable-next-line no-console
      console.log(`  [preflight] Penpot MCP server OK at ${mcpUrl}`);

      // 4. Discover tools
      const toolsResult = await connection.discoverTools();
      if (toolsResult.ok) {
        discoveredTools = toolsResult.value;
        // eslint-disable-next-line no-console
        console.log(`  [preflight] Discovered ${discoveredTools.length} Penpot tools`);
      }

      // 5. Verify plugin is connected (execute_code must reach a Penpot project)
      const pluginCheck = await connection.callTool('execute_code', {
        code: 'return penpot.currentPage?.name ?? null',
      });
      if (pluginCheck.ok) {
        const content = pluginCheck.value as { content?: Array<{ text?: string }> };
        const text = Array.isArray(content.content)
          ? content.content.map(c => c.text ?? '').join('')
          : '';
        let pageName: string | null = null;
        try {
          const parsed = JSON.parse(text) as { result?: string | null };
          pageName = parsed.result ?? null;
        } catch {
          // not JSON — treat as raw string
          pageName = text.trim() || null;
        }

        // Detect error messages returned as text content
        if (pageName && (pageName.includes('Tool execution failed') || pageName.includes('No Penpot plugin instances'))) {
          pageName = null;
        }

        if (pageName) {
          // eslint-disable-next-line no-console
          console.log(`  [preflight] Penpot plugin connected (page: "${pageName}")`);
        } else {
          // eslint-disable-next-line no-console
          console.warn('');
          // eslint-disable-next-line no-console
          console.warn('  ┌─────────────────────────────────────────────────────────────────┐');
          // eslint-disable-next-line no-console
          console.warn('  │  WARNING: Penpot MCP plugin is NOT connected.                  │');
          // eslint-disable-next-line no-console
          console.warn('  │                                                                 │');
          // eslint-disable-next-line no-console
          console.warn('  │  The MCP server is running but no Penpot project is linked.     │');
          // eslint-disable-next-line no-console
          console.warn('  │                                                                 │');
          // eslint-disable-next-line no-console
          console.warn('  │  To fix:                                                        │');
          // eslint-disable-next-line no-console
          console.warn(`  │    1. Open Penpot at ${DEFAULT_SERVICE_URLS.penpotUi}                       │`);
          // eslint-disable-next-line no-console
          console.warn('  │    2. Open a project in the editor                              │');
          // eslint-disable-next-line no-console
          console.warn(`  │    3. Plugin Manager → install ${DEFAULT_SERVICE_URLS.penpotPluginUi}/manifest.json│`);
          // eslint-disable-next-line no-console
          console.warn('  │    4. Click "CONNECT TO MCP SERVER" in the plugin panel         │');
          // eslint-disable-next-line no-console
          console.warn('  └─────────────────────────────────────────────────────────────────┘');
          // eslint-disable-next-line no-console
          console.warn('');
          connection.disconnect();
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'Penpot MCP plugin not connected. Open Penpot, install the plugin, and click Connect.',
            recoverable: true,
          });
        }
      } else {
        // execute_code failed — plugin likely not connected (timeout or error)
        // eslint-disable-next-line no-console
        console.warn('');
        // eslint-disable-next-line no-console
        console.warn('  ┌─────────────────────────────────────────────────────────────────┐');
        // eslint-disable-next-line no-console
        console.warn('  │  WARNING: Penpot MCP plugin is NOT connected.                  │');
        // eslint-disable-next-line no-console
        console.warn('  │                                                                 │');
        // eslint-disable-next-line no-console
        console.warn('  │  To fix:                                                        │');
        // eslint-disable-next-line no-console
        console.warn(`  │    1. Open Penpot at ${DEFAULT_SERVICE_URLS.penpotUi}                       │`);
        // eslint-disable-next-line no-console
        console.warn('  │    2. Open a project in the editor                              │');
        // eslint-disable-next-line no-console
        console.warn(`  │    3. Plugin Manager → install ${DEFAULT_SERVICE_URLS.penpotPluginUi}/manifest.json│`);
        // eslint-disable-next-line no-console
        console.warn('  │    4. Click "CONNECT TO MCP SERVER" in the plugin panel         │');
        // eslint-disable-next-line no-console
        console.warn('  └─────────────────────────────────────────────────────────────────┘');
        // eslint-disable-next-line no-console
        console.warn('');
        connection.disconnect();
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot plugin check failed: ${pluginCheck.error.message}`,
          recoverable: true,
        });
      }

      // 6. Cache session
      const session: DesignToolSession = {
        kind: 'penpot',
        url: mcpUrl,
        connectedAt: new Date().toISOString(),
        documentName: 'Penpot Project',
        supportedTools: discoveredTools.map(t => t.name),
      };

      // Save session
      const filePath = resolve(process.cwd(), sessionPath);
      const dir = resolve(filePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(session, null, 2));
      // eslint-disable-next-line no-console
      console.log(`  [preflight] Session saved to ${sessionPath}`);

      connection.disconnect();
      return Ok(session);
    },

    loadSession(sessionPath?: string): Result<DesignToolSession> {
      const filePath = resolve(process.cwd(), sessionPath ?? DEFAULT_SESSION_PATH);

      if (!existsSync(filePath)) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Penpot session file not found: ${filePath}`,
          recoverable: true,
        });
      }

      try {
        const raw = readFileSync(filePath, 'utf-8');
        const session = JSON.parse(raw) as DesignToolSession;

        if (!session.url || !session.connectedAt || session.kind !== 'penpot') {
          return Err({
            code: 'INVALID_STATE' as const,
            message: 'Penpot session file is missing required fields or has wrong kind',
            recoverable: true,
          });
        }

        const age = Date.now() - new Date(session.connectedAt).getTime();
        if (age > DEFAULT_MAX_AGE_MS) {
          return Err({
            code: 'INVALID_STATE' as const,
            message: `Penpot session expired (${Math.round(age / 60000)}min old)`,
            recoverable: true,
          });
        }

        return Ok(session);
      } catch {
        return Err({
          code: 'INVALID_STATE' as const,
          message: 'Failed to parse Penpot session file',
          recoverable: true,
        });
      }
    },

    async captureScreenshot(mcpClient: MCPClient, nodeId: string): Promise<Result<ScreenshotResult>> {
      // Try Penpot's export tool (discovered dynamically)
      // Common Penpot MCP tool names: export-frame, export-component, get-thumbnail, export_node
      const exportTools = ['export-frame', 'export-component', 'get-thumbnail', 'export_node'];

      for (const toolName of exportTools) {
        const result = await mcpClient.callTool('penpot', toolName, {
          nodeId,
          format: 'png',
          scale: 2,
        });

        if (result.ok) {
          const data = result.value as Record<string, unknown>;
          const imageData = (data.imageData ?? data.data ?? data.base64 ?? '') as string;
          const imageUrl = (data.imageUrl ?? data.url ?? '') as string;

          if (imageData) {
            const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData;
            return Ok({ imageUrl: imageUrl || 'penpot://export', base64 });
          }

          if (imageUrl) {
            try {
              const response = await fetch(imageUrl);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const base64 = Buffer.from(arrayBuffer).toString('base64');
                return Ok({ imageUrl, base64 });
              }
            } catch {
              // Try next tool
            }
          }
        }
      }

      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: 'No Penpot export tool succeeded for screenshot capture',
        recoverable: true,
      });
    },
  };
}
