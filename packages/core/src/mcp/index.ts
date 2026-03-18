// Secret Manager
export type { SecretProvider } from './secret-manager.js';
export { createEnvSecretProvider } from './secret-manager.js';

// MCP Middleware
export type {
  MCPRequest,
  MCPResponse,
  MCPTransport,
  MCPMiddlewareFn,
  RateLimitConfig,
  CacheConfig,
  MCPTrace,
  PermissionChecker,
  TraceRecorder,
  MCPMiddlewareOptions,
} from './mcp-middleware.js';
export {
  createGovernanceMiddleware,
  createAuthMiddleware,
  createRateLimitMiddleware,
  createCacheMiddleware,
  createRetryMiddleware,
  createObservabilityMiddleware,
  composeMCPMiddleware,
} from './mcp-middleware.js';

// MCP Client
export type { ToolDefinition, MCPClient, MCPClientConfig } from './mcp-client.js';
export { createMCPClient } from './mcp-client.js';
