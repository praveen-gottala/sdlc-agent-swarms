/**
 * @module @agentforge/core/mcp/talk-to-figma-transport
 *
 * WebSocket transport for TalkToFigma MCP bridge.
 * Enables bidirectional Figma manipulation (create frames, shapes, text,
 * apply styles, set auto-layout) via the TalkToFigma WebSocket bridge.
 *
 * Architecture: Figma plugin <-> WebSocket bridge (ws://localhost:3055) <-> this transport
 */

import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { MCPRequest, MCPTransport } from './mcp-middleware.js';
import type { ToolDefinition } from './mcp-client.js';

// ============================================================================
// Types
// ============================================================================

/** Configuration for the TalkToFigma WebSocket transport. */
export interface TalkToFigmaConfig {
  /** WebSocket URL for the bridge server. Default: ws://localhost:3055 */
  readonly websocketUrl?: string;
  /** Channel name to join. Auto-generated UUID if omitted. */
  readonly channel?: string;
  /** Reconnect interval in ms on unintentional close. Default: 3000 */
  readonly reconnectIntervalMs?: number;
  /** Timeout for initial connection in ms. Default: 10000 */
  readonly connectionTimeoutMs?: number;
  /** Timeout for individual tool call responses in ms. Default: 30000 */
  readonly responseTimeoutMs?: number;
}

/** Lifecycle handle for a TalkToFigma WebSocket connection. */
export interface TalkToFigmaConnection {
  /** Open the WebSocket and join the channel. */
  connect(): Promise<Result<void>>;
  /** Whether the WebSocket is open and channel joined. */
  isConnected(): boolean;
  /** Send a command through the bridge and await the response. */
  callTool(method: string, params: Readonly<Record<string, unknown>>): Promise<Result<unknown>>;
  /** Close the connection gracefully. */
  disconnect(): void;
  /** The channel name in use. */
  readonly channel: string;
}

/** Pending request awaiting a response from the bridge. */
interface PendingRequest {
  readonly resolve: (result: Result<unknown>) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Static tool list
// ============================================================================

/** Tools exposed by the TalkToFigma bridge. */
export const TALK_TO_FIGMA_TOOLS: readonly ToolDefinition[] = [
  { name: 'create_frame', description: 'Create a new frame node', inputSchema: {} },
  { name: 'create_rectangle', description: 'Create a rectangle shape', inputSchema: {} },
  { name: 'create_text', description: 'Create a text node', inputSchema: {} },
  { name: 'set_fill_color', description: 'Set fill color on a node', inputSchema: {} },
  { name: 'set_stroke_color', description: 'Set stroke color on a node', inputSchema: {} },
  { name: 'set_layout_mode', description: 'Set auto-layout mode on a frame', inputSchema: {} },
  { name: 'set_padding', description: 'Set padding on an auto-layout frame', inputSchema: {} },
  { name: 'set_item_spacing', description: 'Set spacing between children in an auto-layout frame', inputSchema: {} },
  { name: 'set_axis_align', description: 'Set primary/counter axis alignment on an auto-layout frame', inputSchema: {} },
  { name: 'set_layout_sizing', description: 'Set horizontal/vertical sizing mode on an auto-layout frame', inputSchema: {} },
  { name: 'set_corner_radius', description: 'Set corner radius on a node', inputSchema: {} },
  { name: 'move_node', description: 'Move a node to new coordinates', inputSchema: {} },
  { name: 'resize_node', description: 'Resize a node', inputSchema: {} },
  { name: 'set_name', description: 'Set the name of a node', inputSchema: {} },
  { name: 'clone_node', description: 'Clone an existing node', inputSchema: {} },
  { name: 'set_text_content', description: 'Set text content on a text node', inputSchema: {} },
  { name: 'delete_node', description: 'Delete a node', inputSchema: {} },
  { name: 'get_document_info', description: 'Get current document info', inputSchema: {} },
  { name: 'get_selection', description: 'Get current selection', inputSchema: {} },
  { name: 'create_ellipse', description: 'Create an ellipse shape', inputSchema: {} },
  { name: 'create_component', description: 'Create a component node', inputSchema: {} },
  { name: 'create_instance', description: 'Create an instance of a component', inputSchema: {} },
  { name: 'set_opacity', description: 'Set opacity on a node', inputSchema: {} },
] as const;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a TalkToFigma WebSocket connection.
 * Closure-based factory — follows the project's functional style.
 */
export const createTalkToFigmaConnection = (config: TalkToFigmaConfig = {}): TalkToFigmaConnection => {
  const wsUrl = config.websocketUrl ?? 'ws://localhost:3055';
  const channelName = config.channel ?? crypto.randomUUID();
  const reconnectInterval = config.reconnectIntervalMs ?? 3000;
  const connectionTimeout = config.connectionTimeoutMs ?? 10000;
  const responseTimeout = config.responseTimeoutMs ?? 30000;

  // Closure state
  let ws: WebSocket | null = null;
  let connected = false;
  let channelJoined = false;
  let intentionalClose = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingRequests = new Map<string, PendingRequest>();

  /** Reject all pending requests with a disconnect error. */
  const rejectAllPending = (reason: string): void => {
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: reason,
        recoverable: true,
      }));
      pendingRequests.delete(id);
    }
  };

  /** Schedule a reconnection attempt. */
  const scheduleReconnect = (): void => {
    if (intentionalClose || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!intentionalClose && !connected) {
        void connectInternal();
      }
    }, reconnectInterval);
  };

  /** Handle incoming WebSocket messages. */
  const handleMessage = (data: string): void => {
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;

      // Channel join confirmation
      if (parsed.type === 'joined') {
        channelJoined = true;
        return;
      }

      // Response message — match by ID
      // The bridge sends responses as type 'message' (direct) or 'broadcast' (relayed from peer)
      if (parsed.type === 'message' || parsed.type === 'broadcast') {
        const message = parsed.message as Record<string, unknown> | undefined;
        if (!message || typeof message.id !== 'string') return;

        const pending = pendingRequests.get(message.id);
        if (!pending) return;

        clearTimeout(pending.timer);
        pendingRequests.delete(message.id);

        // Bridge may return { error: "...", result: {} } — treat as Err
        if (typeof message.error === 'string' && message.error) {
          pending.resolve(Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `TalkToFigma: ${message.error}`,
            recoverable: true,
          }));
        } else {
          pending.resolve(Ok(message.result ?? message));
        }
      }
    } catch {
      // Ignore unparseable messages
    }
  };

  /** Internal connect logic (used by connect() and reconnect). */
  const connectInternal = (): Promise<Result<void>> => {
    return new Promise<Result<void>>((resolve) => {
      try {
        const socket = new WebSocket(wsUrl);
        let settled = false;

        const timeout = setTimeout(() => {
          if (!settled) {
            settled = true;
            socket.close();
            resolve(Err({
              code: 'MCP_UNAVAILABLE' as const,
              message: `TalkToFigma connection timeout after ${connectionTimeout}ms`,
              recoverable: true,
            }));
          }
        }, connectionTimeout);

        socket.addEventListener('open', () => {
          ws = socket;
          connected = true;

          // Join the channel
          socket.send(JSON.stringify({ type: 'join', channel: channelName }));

          // Wait briefly for join confirmation, then resolve
          const joinCheck = setInterval(() => {
            if (channelJoined) {
              clearInterval(joinCheck);
              clearTimeout(timeout);
              if (!settled) {
                settled = true;
                resolve(Ok(undefined));
              }
            }
          }, 50);

          // Fallback: resolve after a short delay even without explicit join confirmation
          setTimeout(() => {
            clearInterval(joinCheck);
            if (!settled) {
              settled = true;
              channelJoined = true; // Assume joined if no error
              clearTimeout(timeout);
              resolve(Ok(undefined));
            }
          }, 2000);
        });

        socket.addEventListener('message', (event) => {
          handleMessage(typeof event.data === 'string' ? event.data : String(event.data));
        });

        socket.addEventListener('close', () => {
          connected = false;
          channelJoined = false;
          ws = null;
          rejectAllPending('WebSocket closed');

          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(Err({
              code: 'MCP_UNAVAILABLE' as const,
              message: 'TalkToFigma WebSocket closed before connection completed',
              recoverable: true,
            }));
          }

          scheduleReconnect();
        });

        socket.addEventListener('error', () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            connected = false;
            ws = null;
            resolve(Err({
              code: 'MCP_UNAVAILABLE' as const,
              message: `TalkToFigma WebSocket error connecting to ${wsUrl}`,
              recoverable: true,
            }));
          }
        });
      } catch (err) {
        resolve(Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: `TalkToFigma connection failed: ${err instanceof Error ? err.message : String(err)}`,
          recoverable: true,
        }));
      }
    });
  };

  return {
    channel: channelName,

    connect(): Promise<Result<void>> {
      if (connected && channelJoined) {
        return Promise.resolve(Ok(undefined));
      }
      intentionalClose = false;
      return connectInternal();
    },

    isConnected(): boolean {
      return connected && channelJoined;
    },

    async callTool(method: string, params: Readonly<Record<string, unknown>>): Promise<Result<unknown>> {
      if (!connected || !ws) {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'TalkToFigma not connected. Call connect() first.',
          recoverable: true,
        });
      }

      const id = crypto.randomUUID();

      return new Promise<Result<unknown>>((resolve) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          resolve(Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `TalkToFigma response timeout after ${responseTimeout}ms for ${method}`,
            recoverable: true,
          }));
        }, responseTimeout);

        pendingRequests.set(id, { resolve, timer });

        try {
          ws!.send(JSON.stringify({
            type: 'message',
            channel: channelName,
            message: { id, command: method, params },
          }));
        } catch (err) {
          clearTimeout(timer);
          pendingRequests.delete(id);
          resolve(Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `TalkToFigma send failed: ${err instanceof Error ? err.message : String(err)}`,
            recoverable: true,
          }));
        }
      });
    },

    disconnect(): void {
      intentionalClose = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      rejectAllPending('Connection intentionally closed');
      if (ws) {
        ws.close();
        ws = null;
      }
      connected = false;
      channelJoined = false;
    },
  };
};

// ============================================================================
// Transport factory
// ============================================================================

/**
 * Create an MCPTransport backed by the TalkToFigma WebSocket bridge.
 * Auto-connects on first call if not already connected.
 *
 * @returns transport function + connection lifecycle handle
 */
export const createTalkToFigmaTransport = (
  config: TalkToFigmaConfig = {},
): { transport: MCPTransport; connection: TalkToFigmaConnection } => {
  const connection = createTalkToFigmaConnection(config);

  const transport: MCPTransport = async (request: MCPRequest): Promise<Result<unknown>> => {
    // Handle listTools statically
    if (request.method === 'listTools') {
      return Ok([...TALK_TO_FIGMA_TOOLS]);
    }

    // Auto-connect on first real call
    if (!connection.isConnected()) {
      const connectResult = await connection.connect();
      if (!connectResult.ok) {
        return connectResult;
      }
    }

    // Validate method exists in our tool list
    const knownMethod = TALK_TO_FIGMA_TOOLS.some((t) => t.name === request.method);
    if (!knownMethod) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Unknown TalkToFigma method: ${request.method}`,
        recoverable: false,
      });
    }

    return connection.callTool(request.method, request.params);
  };

  return { transport, connection };
};
