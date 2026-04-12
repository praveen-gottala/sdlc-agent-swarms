/**
 * @module @agentforge/core/mcp/design-tool-adapter
 *
 * Abstraction layer for design tools (Figma, Penpot).
 * Each tool provides its own adapter implementing this interface.
 * Pipeline code uses the adapter to remain tool-agnostic.
 */

import type { Result } from '../types/index.js';
import type { MCPClient } from './mcp-client.js';
import type { ToolDefinition } from './mcp-client.js';

/** Supported design tool kinds. */
export type DesignToolKind = 'penpot';

/** Connection configuration for a design tool MCP server. */
export interface DesignToolConnectionConfig {
  /** Primary URL for the MCP transport (WebSocket for Figma, HTTP for Penpot). */
  readonly url: string;
  /** Channel name for WebSocket-based transports (Figma only). */
  readonly channel?: string;
  /** Discovered tools from the server. */
  readonly supportedTools?: readonly string[];
}

/** Session info returned after successful preflight/connection. */
export interface DesignToolSession {
  /** The tool kind. */
  readonly kind: DesignToolKind;
  /** Primary connection URL. */
  readonly url: string;
  /** Channel name (Figma only). */
  readonly channel?: string;
  /** Timestamp of connection. */
  readonly connectedAt: string;
  /** Document or project name. */
  readonly documentName?: string;
  /** Tools discovered from the server. */
  readonly supportedTools?: readonly string[];
}

/** Result of a screenshot capture. */
export interface ScreenshotResult {
  readonly imageUrl: string;
  readonly base64: string;
}

/**
 * Adapter interface for design tools.
 * Encapsulates transport, preflight, and MCP client creation.
 */
export interface DesignToolAdapter {
  /** Which design tool this adapter is for. */
  readonly kind: DesignToolKind;

  /** MCP server prefixes for read and write operations. */
  readonly serverPrefixes: { readonly read: string; readonly write: string };

  /** Static or discovered tool definitions. */
  readonly tools: readonly ToolDefinition[];

  /**
   * Create an MCPClient connected to this design tool.
   * @returns client handle with disconnect function
   */
  createMCPClient(config: DesignToolConnectionConfig): { client: MCPClient; disconnect: () => void };

  /**
   * Run preflight checks (health, Docker start, session cache).
   * @returns session info on success
   */
  runPreflight(options?: Record<string, unknown>): Promise<Result<DesignToolSession>>;

  /**
   * Load a cached session from disk.
   * @returns session info if valid and not expired
   */
  loadSession(sessionPath?: string): Result<DesignToolSession>;

  /**
   * Capture a screenshot of a node in the design tool.
   * @param mcpClient - connected MCP client
   * @param nodeId - node ID to capture
   * @returns base64-encoded screenshot
   */
  captureScreenshot(mcpClient: MCPClient, nodeId: string): Promise<Result<ScreenshotResult>>;
}
