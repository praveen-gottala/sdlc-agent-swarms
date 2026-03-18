/**
 * @module @agentforge/core/mcp/mcp-client
 *
 * Generic MCP client that routes all MCP server interactions through
 * the middleware chain. Agents never call MCP servers directly.
 */

import type { Result } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type {
  MCPRequest,
  MCPResponse,
  MCPTransport,
  MCPMiddlewareFn,
  MCPMiddlewareOptions,
} from './mcp-middleware.js';
import { composeMCPMiddleware } from './mcp-middleware.js';

// ============================================================================
// Types
// ============================================================================

/** Definition of a tool exposed by an MCP server. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/**
 * The MCP client interface as defined in architecture.md.
 * All MCP interactions flow through this interface.
 */
export interface MCPClient {
  /** Call a tool on an MCP server. Returns Result — never throws. */
  callTool(server: string, method: string, params: Readonly<Record<string, unknown>>): Promise<Result<unknown>>;

  /** List available tools on an MCP server. */
  listTools(server: string): Promise<Result<readonly ToolDefinition[]>>;

  /** Check if an MCP server is reachable. */
  isAvailable(server: string): Promise<boolean>;
}

/** Configuration for creating an MCP client. */
export interface MCPClientConfig {
  /** The middleware options (agent, permissions, secrets, etc.). */
  readonly middlewareOptions: MCPMiddlewareOptions;

  /** Transport function that performs the actual MCP server call. */
  readonly transport: MCPTransport;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Execute a request through the middleware chain.
 * Middlewares are composed right-to-left: the first middleware
 * in the array is the outermost wrapper.
 */
const executeWithMiddleware = (
  middlewares: ReadonlyArray<MCPMiddlewareFn>,
  transport: MCPTransport,
  request: MCPRequest,
): Promise<Result<MCPResponse>> => {
  // Build the chain from innermost (transport) outward
  const transportAdapter = async (req: MCPRequest): Promise<Result<MCPResponse>> => {
    const result = await transport(req);
    if (result.ok) {
      return Ok({ data: result.value, cached: false });
    }
    return Err(result.error);
  };

  // Compose middleware right-to-left
  let chain = transportAdapter;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i];
    const next = chain;
    chain = (req: MCPRequest) => mw(req, next);
  }

  return chain(request);
};

/**
 * Create an MCP client with the full middleware chain.
 * Every call flows through: governance → auth → rateLimit → cache → retry → observability
 */
export const createMCPClient = (config: MCPClientConfig): MCPClient => {
  const middlewares = composeMCPMiddleware(config.middlewareOptions);

  return {
    async callTool(
      server: string,
      method: string,
      params: Readonly<Record<string, unknown>>,
    ): Promise<Result<unknown>> {
      const request: MCPRequest = { server, method, params };
      const result = await executeWithMiddleware(middlewares, config.transport, request);
      if (result.ok) {
        return Ok(result.value.data);
      }
      return result;
    },

    async listTools(server: string): Promise<Result<readonly ToolDefinition[]>> {
      const request: MCPRequest = {
        server,
        method: 'listTools',
        params: {},
      };
      const result = await executeWithMiddleware(middlewares, config.transport, request);
      if (result.ok) {
        return Ok(result.value.data as readonly ToolDefinition[]);
      }
      return Err(result.error);
    },

    async isAvailable(server: string): Promise<boolean> {
      const request: MCPRequest = {
        server,
        method: 'listTools',
        params: {},
      };
      const result = await executeWithMiddleware(middlewares, config.transport, request);
      return result.ok;
    },
  };
};
