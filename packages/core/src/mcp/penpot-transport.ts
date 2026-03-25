/**
 * @module @agentforge/core/mcp/penpot-transport
 *
 * MCP Streamable HTTP transport for the Penpot MCP server.
 *
 * Penpot MCP uses the MCP Streamable HTTP protocol:
 * 1. Initialize handshake (initialize → notifications/initialized)
 * 2. Session ID tracking via Mcp-Session-Id header
 * 3. SSE-wrapped JSON-RPC 2.0 responses (event: message, data: {...})
 *
 * Server endpoints:
 * - http://localhost:4401/mcp (Streamable HTTP)
 * - ws://localhost:4402 (WebSocket for plugin)
 */

import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { DEFAULT_SERVICE_URLS } from '../constants.js';
import type { MCPRequest, MCPTransport } from './mcp-middleware.js';
import type { ToolDefinition } from './mcp-client.js';

/** Configuration for the Penpot MCP transport. */
export interface PenpotTransportConfig {
  /** HTTP URL for the MCP server. Default: http://localhost:4401/mcp */
  readonly mcpUrl?: string;
  /** Timeout for requests in ms. Default: 30000 */
  readonly requestTimeoutMs?: number;
}

/** Connection handle for Penpot MCP. */
export interface PenpotConnection {
  /** Whether the server is initialized and reachable. */
  isConnected(): boolean;
  /** Call a tool on the Penpot MCP server. */
  callTool(method: string, params: Readonly<Record<string, unknown>>): Promise<Result<unknown>>;
  /** Discover available tools from the server. */
  discoverTools(): Promise<Result<readonly ToolDefinition[]>>;
  /** Check server health (attempts initialize if needed). */
  healthCheck(): Promise<Result<void>>;
  /** Reset connection state. */
  disconnect(): void;
}

let requestIdCounter = 0;

/**
 * Parse an SSE response body to extract the JSON-RPC result.
 * Penpot MCP returns responses as SSE: "event: message\ndata: {...}\n\n"
 */
function parseSSEResponse(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        return JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        // Try next data line
      }
    }
  }
  // Maybe it's plain JSON (not SSE-wrapped)
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Create a connection to the Penpot MCP server.
 * Handles the MCP Streamable HTTP protocol with session management.
 */
export function createPenpotConnection(config: PenpotTransportConfig = {}): PenpotConnection {
  const mcpUrl = config.mcpUrl ?? DEFAULT_SERVICE_URLS.penpotMcp;
  const requestTimeout = config.requestTimeoutMs ?? 30000;
  let initialized = false;
  let sessionId: string | null = null;
  let cachedTools: readonly ToolDefinition[] | null = null;

  /** Build headers for MCP Streamable HTTP requests. */
  function buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, application/json',
    };
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }
    return headers;
  }

  /** Send a JSON-RPC 2.0 request and parse the SSE response. */
  async function sendRequest(
    method: string,
    params: Record<string, unknown> = {},
    hasId = true,
  ): Promise<Result<unknown>> {
    const id = hasId ? ++requestIdCounter : undefined;
    const body: Record<string, unknown> = { jsonrpc: '2.0', method, params };
    if (id !== undefined) body.id = id;

    try {
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(requestTimeout),
      });

      // Extract session ID from response headers
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId) {
        sessionId = newSessionId;
      }

      // Notifications (no id) return 202 with no body
      if (!hasId) {
        return Ok(undefined);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const parsed = parseSSEResponse(errorText);
        const errorMsg = parsed?.error
          ? (parsed.error as { message?: string }).message ?? JSON.stringify(parsed.error)
          : `HTTP ${response.status}`;
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot MCP error: ${errorMsg}`,
          recoverable: response.status >= 500,
        });
      }

      const responseText = await response.text();
      const data = parseSSEResponse(responseText);

      if (!data) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot MCP returned unparseable response: ${responseText.slice(0, 200)}`,
          recoverable: true,
        });
      }

      if (data.error) {
        const err = data.error as { code?: number; message?: string };
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot MCP error: ${err.message ?? JSON.stringify(data.error)} (code: ${err.code ?? 'unknown'})`,
          recoverable: true,
        });
      }

      return Ok(data.result);
    } catch (err) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Penpot MCP request failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  }

  /** Run the MCP initialize handshake. */
  async function ensureInitialized(): Promise<Result<void>> {
    if (initialized && sessionId) {
      return Ok(undefined);
    }

    // Step 1: Send initialize request
    const initResult = await sendRequest('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'agentforge', version: '0.1.0' },
    });

    if (!initResult.ok) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Penpot MCP initialize failed: ${initResult.error.message}`,
        recoverable: true,
      });
    }

    // Step 2: Send initialized notification (no id, no response expected)
    await sendRequest('notifications/initialized', {}, false);

    initialized = true;
    return Ok(undefined);
  }

  return {
    isConnected(): boolean {
      return initialized && sessionId !== null;
    },

    async callTool(method: string, params: Readonly<Record<string, unknown>>): Promise<Result<unknown>> {
      const initResult = await ensureInitialized();
      if (!initResult.ok) return initResult as Result<never>;

      return sendRequest('tools/call', { name: method, arguments: params });
    },

    async discoverTools(): Promise<Result<readonly ToolDefinition[]>> {
      if (cachedTools) {
        return Ok(cachedTools);
      }

      const initResult = await ensureInitialized();
      if (!initResult.ok) return initResult as Result<never>;

      const result = await sendRequest('tools/list', {});
      if (!result.ok) return result as Result<never>;

      const data = result.value as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> };
      const tools: ToolDefinition[] = (data.tools ?? []).map(t => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema ?? {},
      }));

      cachedTools = tools;
      return Ok(tools);
    },

    async healthCheck(): Promise<Result<void>> {
      try {
        const result = await ensureInitialized();
        if (result.ok) {
          return Ok(undefined);
        }
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot MCP health check failed: ${result.error.message}`,
          recoverable: true,
        });
      } catch (err) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `Penpot MCP not reachable at ${mcpUrl}: ${err instanceof Error ? err.message : String(err)}`,
          recoverable: true,
        });
      }
    },

    disconnect(): void {
      initialized = false;
      sessionId = null;
      cachedTools = null;
    },
  };
}

/**
 * Create an MCPTransport backed by the Penpot MCP server.
 * Auto-initializes and discovers tools on first call.
 */
export function createPenpotTransport(
  config: PenpotTransportConfig = {},
): { transport: MCPTransport; connection: PenpotConnection } {
  const connection = createPenpotConnection(config);

  const transport: MCPTransport = async (request: MCPRequest): Promise<Result<unknown>> => {
    if (request.method === 'listTools') {
      return connection.discoverTools();
    }
    return connection.callTool(request.method, request.params);
  };

  return { transport, connection };
}
