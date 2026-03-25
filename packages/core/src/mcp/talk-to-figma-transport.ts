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
import { DEFAULT_SERVICE_URLS } from '../constants.js';
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

/**
 * Tools exposed by the TalkToFigma bridge (cursor-talk-to-figma-mcp).
 * This list matches the upstream plugin exactly. See ADR-028.
 * join_channel is excluded — it's connection management, not a design tool.
 */
export const TALK_TO_FIGMA_TOOLS: readonly ToolDefinition[] = [
  // ── Document & Selection ──
  { name: 'get_document_info', description: 'Get detailed information about the current Figma document', inputSchema: {} },
  { name: 'get_selection', description: 'Get information about the current selection in Figma', inputSchema: {} },
  { name: 'read_my_design', description: 'Get detailed information about the current selection including all node details', inputSchema: {} },
  { name: 'get_node_info', description: 'Get detailed information about a specific node', inputSchema: {} },
  { name: 'get_nodes_info', description: 'Get detailed information about multiple nodes', inputSchema: {} },
  { name: 'set_focus', description: 'Select and viewport-center a designated node', inputSchema: {} },
  { name: 'set_selections', description: 'Select multiple nodes and scroll viewport to show them', inputSchema: {} },

  // ── Creation ──
  { name: 'create_frame', description: 'Create a new frame with position, dimensions, and optional auto-layout', inputSchema: {} },
  { name: 'create_rectangle', description: 'Create a rectangle with position and dimensions', inputSchema: {} },
  { name: 'create_text', description: 'Create a text node with font customization', inputSchema: {} },
  { name: 'create_component_instance', description: 'Create an instance of a component by componentId or componentKey', inputSchema: {} },

  // ── Styling ──
  { name: 'set_fill_color', description: 'Set fill color (RGBA 0-1 floats) on a node', inputSchema: {} },
  { name: 'set_stroke_color', description: 'Set stroke color and weight on a node', inputSchema: {} },
  { name: 'set_corner_radius', description: 'Set corner radius with optional per-corner control', inputSchema: {} },
  { name: 'set_text_content', description: 'Set text content on an existing text node', inputSchema: {} },
  { name: 'set_multiple_text_contents', description: 'Set multiple text contents in batch', inputSchema: {} },

  // ── Auto-Layout ──
  { name: 'set_layout_mode', description: 'Set layout mode (NONE/HORIZONTAL/VERTICAL) and wrap behavior', inputSchema: {} },
  { name: 'set_padding', description: 'Set padding values for an auto-layout frame', inputSchema: {} },
  { name: 'set_item_spacing', description: 'Set spacing between children in an auto-layout frame', inputSchema: {} },
  { name: 'set_axis_align', description: 'Set primary/counter axis alignment on an auto-layout frame', inputSchema: {} },
  { name: 'set_layout_sizing', description: 'Set horizontal/vertical sizing mode (FIXED/HUG/FILL)', inputSchema: {} },

  // ── Transform & Mutation ──
  { name: 'move_node', description: 'Move a node to new x,y coordinates', inputSchema: {} },
  { name: 'resize_node', description: 'Resize a node to new width and height', inputSchema: {} },
  { name: 'clone_node', description: 'Clone an existing node with optional offset', inputSchema: {} },
  { name: 'delete_node', description: 'Delete a single node', inputSchema: {} },
  { name: 'delete_multiple_nodes', description: 'Delete multiple nodes at once', inputSchema: {} },

  // ── Scanning & Discovery ──
  { name: 'scan_text_nodes', description: 'Scan all text nodes in a selected node', inputSchema: {} },
  { name: 'scan_nodes_by_types', description: 'Find child nodes matching specific type criteria', inputSchema: {} },

  // ── Components & Styles ──
  { name: 'get_styles', description: 'Get all styles from the current document', inputSchema: {} },
  { name: 'get_local_components', description: 'Get all local components from the document', inputSchema: {} },
  { name: 'get_instance_overrides', description: 'Get override properties from a component instance', inputSchema: {} },
  { name: 'set_instance_overrides', description: 'Apply overrides to target component instances', inputSchema: {} },

  // ── Annotations ──
  { name: 'get_annotations', description: 'Get all annotations in the document or specific node', inputSchema: {} },
  { name: 'set_annotation', description: 'Create or update an annotation with markdown', inputSchema: {} },
  { name: 'set_multiple_annotations', description: 'Batch process multiple annotations', inputSchema: {} },

  // ── Export ──
  { name: 'export_node_as_image', description: 'Export a node as PNG/JPG/SVG/PDF image', inputSchema: {} },

  // ── Prototyping (FigJam) ──
  { name: 'get_reactions', description: 'Get prototype flow reactions from nodes', inputSchema: {} },
  { name: 'set_default_connector', description: 'Set a connector node as the default connector style', inputSchema: {} },
  { name: 'create_connections', description: 'Create connector lines between nodes', inputSchema: {} },

  // ── AgentForge Extensions (patched into plugin via patch-plugin-commands.js) ──
  // See ADR-029 for details
  { name: 'create_ellipse', description: 'Create an ellipse/circle shape', inputSchema: {} },
  { name: 'create_line', description: 'Create a line with stroke color and weight', inputSchema: {} },
  { name: 'create_vector', description: 'Create a vector node with SVG path data', inputSchema: {} },
  { name: 'create_polygon', description: 'Create a polygon (triangle, hexagon, etc.)', inputSchema: {} },
  { name: 'create_star', description: 'Create a star shape', inputSchema: {} },
  { name: 'create_component', description: 'Create a new reusable component', inputSchema: {} },
  { name: 'create_boolean_operation', description: 'Combine nodes with boolean operation (UNION/SUBTRACT/INTERSECT/EXCLUDE)', inputSchema: {} },
  { name: 'set_effects', description: 'Set effects (drop shadow, inner shadow, blur) on a node', inputSchema: {} },
  { name: 'set_gradient_fill', description: 'Set gradient fill (linear, radial, angular, diamond)', inputSchema: {} },
  { name: 'set_image_fill', description: 'Set image fill from base64 bytes', inputSchema: {} },
  { name: 'set_font_properties', description: 'Set font family, style, size, line height, letter spacing on text', inputSchema: {} },
  { name: 'set_opacity', description: 'Set opacity (0-1) on a node', inputSchema: {} },
  { name: 'set_name', description: 'Set the name of a node', inputSchema: {} },
  { name: 'set_constraints', description: 'Set responsive constraints (horizontal/vertical) on a node', inputSchema: {} },
  { name: 'group_nodes', description: 'Group multiple nodes together', inputSchema: {} },
  { name: 'ungroup', description: 'Ungroup a group node, releasing its children', inputSchema: {} },
  { name: 'flatten_node', description: 'Flatten a node into a single vector', inputSchema: {} },
  { name: 'set_rotation', description: 'Set rotation angle on a node', inputSchema: {} },
  { name: 'set_visibility', description: 'Show or hide a node', inputSchema: {} },
  { name: 'set_locked', description: 'Lock or unlock a node', inputSchema: {} },
  { name: 'set_blend_mode', description: 'Set blend mode (NORMAL, MULTIPLY, SCREEN, OVERLAY, etc.)', inputSchema: {} },
  { name: 'set_mask', description: 'Set a node as a clipping mask', inputSchema: {} },
  { name: 'set_clip_content', description: 'Enable/disable content clipping on a frame', inputSchema: {} },
  { name: 'set_layout_align', description: 'Set layout alignment within auto-layout parent (STRETCH, INHERIT)', inputSchema: {} },
  { name: 'set_layout_grow', description: 'Set flex grow factor within auto-layout parent', inputSchema: {} },
  { name: 'set_size_constraints', description: 'Set min/max width and height', inputSchema: {} },
  { name: 'set_text_properties', description: 'Set text auto-resize, text case, paragraph spacing, alignment', inputSchema: {} },
  { name: 'set_overflow', description: 'Set scroll/overflow direction (NONE, HORIZONTAL, VERTICAL, BOTH)', inputSchema: {} },
  { name: 'set_layout_grid', description: 'Set layout grid (columns, rows, grid) on a frame', inputSchema: {} },
  { name: 'set_export_settings', description: 'Configure export settings (format, scale, suffix)', inputSchema: {} },
  { name: 'set_strokes', description: 'Set multiple strokes with weight, align, dash pattern', inputSchema: {} },
  { name: 'set_reactions', description: 'Set prototype interactions/reactions on a node', inputSchema: {} },
  { name: 'create_page', description: 'Create a new page in the document', inputSchema: {} },
  { name: 'set_current_page', description: 'Switch to a different page', inputSchema: {} },
  { name: 'get_pages', description: 'List all pages in the document', inputSchema: {} },
  { name: 'create_paint_style', description: 'Create a reusable paint style (solid or gradient)', inputSchema: {} },
  { name: 'create_text_style', description: 'Create a reusable text style with font properties', inputSchema: {} },
  { name: 'create_effect_style', description: 'Create a reusable effect style (shadows, blur)', inputSchema: {} },
  { name: 'apply_style', description: 'Apply a saved style (fill, stroke, effect, text) to a node', inputSchema: {} },
  { name: 'import_svg', description: 'Import an SVG string as a node', inputSchema: {} },
  { name: 'swap_component_instance', description: 'Swap a component instance to a different component', inputSchema: {} },
  { name: 'detach_instance', description: 'Detach a component instance into a plain frame', inputSchema: {} },
  { name: 'create_table', description: 'Create a table structure with rows and columns', inputSchema: {} },
] as const;

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a TalkToFigma WebSocket connection.
 * Closure-based factory — follows the project's functional style.
 */
export const createTalkToFigmaConnection = (config: TalkToFigmaConfig = {}): TalkToFigmaConnection => {
  const wsUrl = config.websocketUrl ?? DEFAULT_SERVICE_URLS.figmaWsBridge;
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
