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
      // Use execute_code + shape.export() to bypass the broken export_shape tool.
      // See docs/lessons-learned.md "export_shape is broken" entry.
      const code = `
        const shape = penpot.currentPage?.getShapeById("${nodeId}");
        if (!shape) return { error: "Shape not found: ${nodeId}" };
        try {
          const data = await shape.export({ type: "png", scale: 2 });
          const bytes = new Uint8Array(data);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return { base64: btoa(binary) };
        } catch (e) {
          return { error: e.message || String(e) };
        }
      `;

      const result = await mcpClient.callTool('penpot', 'execute_code', { code });

      if (!result.ok) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot screenshot failed: ${result.error.message}`,
          recoverable: true,
        });
      }

      const content = result.value as { content?: Array<{ type?: string; text?: string; data?: string }> };
      const text = Array.isArray(content.content)
        ? content.content.map(c => c.text ?? '').join('')
        : '';

      try {
        const parsed = JSON.parse(text) as { result?: { base64?: string; error?: string } };
        if (parsed.result?.error) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Shape export error: ${parsed.result.error}`,
            recoverable: true,
          });
        }
        if (parsed.result?.base64) {
          return Ok({ imageUrl: 'penpot://export', base64: parsed.result.base64 });
        }
      } catch {
        // Check if text itself is base64
        if (text.startsWith('iVBOR') || text.startsWith('/9j/')) {
          return Ok({ imageUrl: 'penpot://export', base64: text });
        }
      }

      // Fallback: check for image block in response
      if (Array.isArray(content.content)) {
        const imageBlock = content.content.find(c => c.type === 'image');
        if (imageBlock?.data) {
          return Ok({ imageUrl: 'penpot://export', base64: imageBlock.data });
        }
      }

      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: 'No image data in Penpot export response',
        recoverable: true,
      });
    },
  };
}
