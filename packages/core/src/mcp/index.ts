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

// TalkToFigma WebSocket Transport
export type { TalkToFigmaConfig, TalkToFigmaConnection } from './talk-to-figma-transport.js';
export { createTalkToFigmaTransport, TALK_TO_FIGMA_TOOLS } from './talk-to-figma-transport.js';

// Design Tool Adapter
export type {
  DesignToolKind,
  DesignToolConnectionConfig,
  DesignToolSession,
  DesignToolAdapter,
} from './design-tool-adapter.js';
// Re-export ScreenshotResult from adapter (canonical location)
export type { ScreenshotResult as DesignToolScreenshotResult } from './design-tool-adapter.js';

// Figma Adapter
export type { FigmaAdapterConfig, FigmaAdapterLog } from './figma-adapter.js';
export { createFigmaAdapter, discoverFigmaChannels, discoverFigmaTools } from './figma-adapter.js';

// Penpot Transport
export type { PenpotTransportConfig, PenpotConnection } from './penpot-transport.js';
export { createPenpotConnection, createPenpotTransport } from './penpot-transport.js';

// Penpot Adapter
export { createPenpotAdapter } from './penpot-adapter.js';

// Playwright Transport
export type { PlaywrightTransportConfig, PlaywrightTransportHandle } from './playwright-transport.js';
export { createPlaywrightTransport, createPlaywrightTransportFromPage, PLAYWRIGHT_TOOLS } from './playwright-transport.js';
