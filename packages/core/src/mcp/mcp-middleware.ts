/**
 * @module @agentforge/core/mcp/mcp-middleware
 *
 * Middleware chain for MCP client calls.
 * Execution order: observability → governance → auth → rateLimit → cache(check) → retry(call) → cache(store)
 * Observability wraps the entire chain so every MCP interaction (including cache hits) produces a trace.
 */

import type { Result, AgentForgeError, AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { SecretProvider } from './secret-manager.js';

// ============================================================================
// Types
// ============================================================================

/** Represents an outgoing MCP call before it reaches the server. */
export interface MCPRequest {
  readonly server: string;
  readonly method: string;
  readonly params: Readonly<Record<string, unknown>>;
  /** Auth token injected by auth middleware, if available. */
  readonly authToken?: string;
  /** Trace ID assigned by observability middleware. */
  readonly traceId?: string;
}

/** The response from an MCP server call. */
export interface MCPResponse {
  readonly data: unknown;
  readonly cached: boolean;
}

/** Function that performs the actual MCP server call. */
export type MCPTransport = (request: MCPRequest) => Promise<Result<unknown>>;

/** A middleware function that wraps the transport. */
export type MCPMiddlewareFn = (
  request: MCPRequest,
  next: (request: MCPRequest) => Promise<Result<MCPResponse>>,
) => Promise<Result<MCPResponse>>;

/** Per-server rate limit configuration. */
export interface RateLimitConfig {
  /** Maximum requests per window. Default: 60. */
  readonly maxRequests: number;
  /** Window duration in milliseconds. Default: 60000 (1 minute). */
  readonly windowMs: number;
}

/** Per-server cache configuration. */
export interface CacheConfig {
  /** Cache TTL in milliseconds. Default: 300000 (5 minutes). */
  readonly ttlMs: number;
}

/** Trace entry recorded by observability middleware. */
export interface MCPTrace {
  readonly traceId: string;
  readonly server: string;
  readonly method: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly cached: boolean;
  readonly error?: string;
}

/** Callback for permission checking. Matches governance middleware signature. */
export type PermissionChecker = (
  agent: AgentContract,
  action: { readonly type: string; readonly server: string; readonly method: string },
) => Result<void>;

/** Callback for recording observability traces. */
export type TraceRecorder = (trace: MCPTrace) => void;

// ============================================================================
// Governance Middleware
// ============================================================================

/**
 * Blocks MCP calls that the agent lacks permission for.
 * Calls governance.checkPermission before the request proceeds.
 */
export const createGovernanceMiddleware = (
  agent: AgentContract,
  checker: PermissionChecker,
): MCPMiddlewareFn => {
  return async (request, next) => {
    const result = checker(agent, {
      type: 'mcp_call',
      server: request.server,
      method: request.method,
    });
    if (!result.ok) {
      return Err(result.error);
    }
    return next(request);
  };
};

// ============================================================================
// Auth Middleware
// ============================================================================

/**
 * Injects authentication tokens from the secret manager.
 * If no credentials are configured, passes through without auth.
 */
export const createAuthMiddleware = (
  secretProvider: SecretProvider,
): MCPMiddlewareFn => {
  return async (request, next) => {
    const tokenResult = secretProvider.getSecret(request.server, 'TOKEN');
    const authToken = tokenResult.ok ? tokenResult.value : undefined;
    return next({ ...request, authToken });
  };
};

// ============================================================================
// Rate Limit Middleware
// ============================================================================

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  queue: Array<{ resolve: () => void }>;
}

/**
 * Token bucket rate limiter per MCP server.
 * When the bucket is empty, queues the request and waits.
 */
export const createRateLimitMiddleware = (
  configs: Readonly<Record<string, RateLimitConfig>> = {},
  defaultConfig: RateLimitConfig = { maxRequests: 60, windowMs: 60_000 },
): MCPMiddlewareFn => {
  const buckets = new Map<string, TokenBucket>();

  const getBucket = (server: string): TokenBucket => {
    let bucket = buckets.get(server);
    if (!bucket) {
      const config = configs[server] ?? defaultConfig;
      bucket = { tokens: config.maxRequests, lastRefill: Date.now(), queue: [] };
      buckets.set(server, bucket);
    }
    return bucket;
  };

  const refill = (server: string, bucket: TokenBucket): void => {
    const config = configs[server] ?? defaultConfig;
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= config.windowMs) {
      bucket.tokens = config.maxRequests;
      bucket.lastRefill = now;
    } else {
      const fraction = elapsed / config.windowMs;
      const refilled = Math.floor(fraction * config.maxRequests);
      if (refilled > 0) {
        bucket.tokens = Math.min(config.maxRequests, bucket.tokens + refilled);
        bucket.lastRefill = now;
      }
    }
  };

  const acquire = async (server: string): Promise<void> => {
    const bucket = getBucket(server);
    refill(server, bucket);

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return;
    }

    // Queue the request and wait
    return new Promise<void>((resolve) => {
      bucket.queue.push({ resolve });
      // Set a timer to process the queue when tokens refill
      const config = configs[server] ?? defaultConfig;
      const waitTime = config.windowMs / config.maxRequests;
      setTimeout(() => {
        refill(server, bucket);
        while (bucket.tokens > 0 && bucket.queue.length > 0) {
          bucket.tokens--;
          const queued = bucket.queue.shift();
          queued?.resolve();
        }
      }, waitTime);
    });
  };

  return async (request, next) => {
    await acquire(request.server);
    return next(request);
  };
};

// ============================================================================
// Cache Middleware
// ============================================================================

interface CacheEntry {
  readonly data: unknown;
  readonly expiresAt: number;
}

/**
 * Methods that are considered idempotent reads and can be cached.
 * Write operations always bypass the cache.
 */
const CACHEABLE_METHOD_PREFIXES = [
  'list',
  'get_',
  'read_',
  'describe_',
  'search_',
];

const isCacheable = (method: string): boolean =>
  CACHEABLE_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix));

const buildCacheKey = (server: string, method: string, params: Readonly<Record<string, unknown>>): string =>
  `${server}:${method}:${JSON.stringify(params)}`;

/**
 * Caches responses for idempotent read operations.
 * Write operations always bypass the cache.
 */
export const createCacheMiddleware = (
  configs: Readonly<Record<string, CacheConfig>> = {},
  defaultConfig: CacheConfig = { ttlMs: 300_000 },
): MCPMiddlewareFn => {
  const cache = new Map<string, CacheEntry>();

  return async (request, next) => {
    if (!isCacheable(request.method)) {
      return next(request);
    }

    const key = buildCacheKey(request.server, request.method, request.params);
    const cached = cache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return Ok({ data: cached.data, cached: true });
    }

    // Remove expired entry
    if (cached) {
      cache.delete(key);
    }

    const result = await next(request);
    if (result.ok) {
      const ttl = configs[request.server]?.ttlMs ?? defaultConfig.ttlMs;
      cache.set(key, { data: result.value.data, expiresAt: Date.now() + ttl });
    }

    return result;
  };
};

// ============================================================================
// Retry Middleware
// ============================================================================

/** Errors that are considered transient and worth retrying. */
const isTransient = (error: AgentForgeError): boolean => {
  const transientCodes: ReadonlyArray<string> = [
    'MCP_UNAVAILABLE',
    'LLM_RATE_LIMIT',
    'LLM_TIMEOUT',
  ];
  return transientCodes.includes(error.code);
};

/**
 * Retries transient failures with exponential backoff.
 * Delays: 1s, 2s, 4s, 8s, 16s. Max 5 retries.
 */
export const createRetryMiddleware = (
  maxRetries = 5,
  baseDelayMs = 1000,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): MCPMiddlewareFn => {
  return async (request, next) => {
    let lastError: AgentForgeError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await next(request);
      if (result.ok) {
        return result;
      }

      lastError = result.error;
      if (!isTransient(result.error) || attempt === maxRetries) {
        return result;
      }

      const delay = baseDelayMs * Math.pow(2, attempt);
      await sleepFn(delay);
    }

    return Err(lastError ?? {
      code: 'MCP_UNAVAILABLE' as const,
      message: `MCP call to ${request.server}.${request.method} failed after ${maxRetries} retries`,
      context: { server: request.server, method: request.method },
      recoverable: false,
    } satisfies AgentForgeError);
  };
};

// ============================================================================
// Observability Middleware
// ============================================================================

let traceCounter = 0;

/** Generate a unique trace ID. */
const generateTraceId = (): string => {
  traceCounter++;
  return `mcp_${Date.now()}_${traceCounter}`;
};

/**
 * Records trace information for every MCP call.
 * Phase 1: structured console logging. Phase 2: OpenTelemetry.
 */
export const createObservabilityMiddleware = (
  recorder?: TraceRecorder,
): MCPMiddlewareFn => {
  const defaultRecorder: TraceRecorder = (trace) => {
    const status = trace.success ? 'OK' : 'FAIL';
    const cacheTag = trace.cached ? ' [cached]' : '';
    // Structured log — never includes secrets
    console.log(
      `[MCP] ${trace.traceId} ${trace.server}.${trace.method} ${status} ${trace.latencyMs}ms${cacheTag}`,
    );
  };

  const record = recorder ?? defaultRecorder;

  return async (request, next) => {
    const traceId = request.traceId ?? generateTraceId();
    const startTime = Date.now();
    const tracedRequest = { ...request, traceId };

    const result = await next(tracedRequest);

    const endTime = Date.now();
    const trace: MCPTrace = {
      traceId,
      server: request.server,
      method: request.method,
      startTime,
      endTime,
      latencyMs: endTime - startTime,
      success: result.ok,
      cached: result.ok ? result.value.cached : false,
      error: result.ok ? undefined : result.error.message,
    };

    record(trace);
    return result;
  };
};

// ============================================================================
// Middleware Chain Composer
// ============================================================================

/** Options for building the MCP middleware chain. */
export interface MCPMiddlewareOptions {
  readonly agent: AgentContract;
  readonly permissionChecker: PermissionChecker;
  readonly secretProvider: SecretProvider;
  readonly rateLimitConfigs?: Readonly<Record<string, RateLimitConfig>>;
  readonly cacheConfigs?: Readonly<Record<string, CacheConfig>>;
  readonly traceRecorder?: TraceRecorder;
  readonly maxRetries?: number;
  readonly baseRetryDelayMs?: number;
  /** Injectable sleep function for testing. */
  readonly sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Compose the full middleware chain in the correct order:
 * observability → governance → auth → rateLimit → cache → retry
 *
 * Observability is outermost so every MCP interaction — including cache hits
 * and governance-blocked calls — produces an observability trace record.
 * See ADR-018 for why this ordering was chosen.
 */
export const composeMCPMiddleware = (
  options: MCPMiddlewareOptions,
): ReadonlyArray<MCPMiddlewareFn> => [
  // DEVIATION: ADR-018
  // PRD v2.0 Section 18 specifies: "observability hooks" for all MCP interactions
  // Implementation: observability is outermost to capture cache hits and governance blocks
  // Rationale: see ADR-018
  createObservabilityMiddleware(options.traceRecorder),
  createGovernanceMiddleware(options.agent, options.permissionChecker),
  createAuthMiddleware(options.secretProvider),
  createRateLimitMiddleware(options.rateLimitConfigs),
  createCacheMiddleware(options.cacheConfigs),
  createRetryMiddleware(options.maxRetries, options.baseRetryDelayMs, options.sleepFn),
];
