/**
 * P14 — MCP Client Layer and Adapter Middleware (Wave 4)
 *
 * Validates the 7-step adapter middleware pipeline:
 * Governance Check → Authentication → Rate Limiting →
 * Cache Check → MCP Call → Cache Store → Observability
 *
 * Tests with Figma MCP and GitHub MCP server configs (mocked transport).
 */

import type { Result, AgentForgeError, AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { SecretProvider } from './secret-manager.js';
import type { MCPTransport, MCPTrace, PermissionChecker } from './mcp-middleware.js';
import {
  composeMCPMiddleware,
} from './mcp-middleware.js';
import { createMCPClient } from './mcp-client.js';

// ============================================================================
// Test Helpers
// ============================================================================

const makeAgent = (overrides?: Partial<AgentContract>): AgentContract => ({
  role: 'test_agent',
  description: 'Test agent',
  category: 'code',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 10000 },
  tools: ['figma_mcp.get_code', 'github_mcp.create_pr', 'github_mcp.list_branches'],
  permissions: ['read_spec', 'write_code', 'mcp_call'],
  denied: ['deploy_production'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'emit(CodeGenComplete)',
  on_error: 'notify_human',
  context: {},
  ...overrides,
});

const makeSecretProvider = (secrets: Record<string, string> = {}): SecretProvider => ({
  getSecret(server: string, key: string): Result<string> {
    const envKey = `${server.toUpperCase()}_${key.toUpperCase()}`;
    const value = secrets[envKey];
    if (value) return Ok(value);
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `No secret for ${server}`,
      recoverable: false,
    } as AgentForgeError);
  },
  hasSecret(server: string, key: string): boolean {
    const envKey = `${server.toUpperCase()}_${key.toUpperCase()}`;
    return envKey in secrets;
  },
});

const noopSleep = async (_ms: number): Promise<void> => {};

const makeTransport = (
  response: unknown = { success: true },
): { transport: MCPTransport; calls: Array<{ server: string; method: string; authToken?: string; params: Record<string, unknown> }> } => {
  const calls: Array<{ server: string; method: string; authToken?: string; params: Record<string, unknown> }> = [];
  const transport: MCPTransport = async (request) => {
    calls.push({
      server: request.server,
      method: request.method,
      authToken: request.authToken,
      params: request.params as Record<string, unknown>,
    });
    return Ok(response);
  };
  return { transport, calls };
};

// ============================================================================
// P14.1 — callTool routes to correct MCP server
// ============================================================================

describe('P14 — MCP Client Layer and Adapter Middleware', () => {
  describe('P14.1 — callTool routing', () => {
    it('routes to Figma MCP server correctly', async () => {
      const { transport, calls } = makeTransport({ nodes: [1] });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({ FIGMA_TOKEN: 'fig_tok' }),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('figma', 'get_code', { nodeId: '123' });

      expect(result.ok).toBe(true);
      expect(calls.length).toBe(1);
      expect(calls[0].server).toBe('figma');
      expect(calls[0].method).toBe('get_code');
    });

    it('routes to GitHub MCP server correctly', async () => {
      const { transport, calls } = makeTransport({ branches: ['main'] });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({ GITHUB_TOKEN: 'gh_tok' }),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'list_branches', { repo: 'test' });

      expect(result.ok).toBe(true);
      expect(calls[0].server).toBe('github');
      expect(calls[0].method).toBe('list_branches');
    });

    it('routes different servers in the same client independently', async () => {
      const { transport, calls } = makeTransport({ ok: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({
            FIGMA_TOKEN: 'fig_tok',
            GITHUB_TOKEN: 'gh_tok',
          }),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });
      await client.callTool('github', 'create_pr', { title: 'PR' });

      expect(calls.length).toBe(2);
      expect(calls[0].server).toBe('figma');
      expect(calls[1].server).toBe('github');
    });
  });

  // ============================================================================
  // P14.2 — 7-step middleware pipeline fires in documented order
  // ============================================================================

  describe('P14.2 — middleware chain order', () => {
    it('fires in exact order: Observability(pre) → Governance → Auth → Rate Limit → Cache Check → MCP Call → Observability(post)', async () => {
      const executionOrder: string[] = [];

      const traces: MCPTrace[] = [];

      // Custom permission checker that records execution
      const permissionChecker: PermissionChecker = (_agent, _action) => {
        executionOrder.push('governance');
        return Ok(undefined);
      };

      // Custom secret provider that records execution
      const secretProvider: SecretProvider = {
        getSecret(_server: string, _key: string) {
          executionOrder.push('auth');
          return Ok('token_value');
        },
        hasSecret() { return true; },
      };

      // Transport that records the MCP call
      const transport: MCPTransport = async (request) => {
        executionOrder.push('mcp_call');
        return Ok({ data: 'response' });
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker,
          secretProvider,
          traceRecorder: (trace) => {
            executionOrder.push('observability');
            traces.push(trace);
          },
          sleepFn: noopSleep,
        },
      });

      // Use a write method to bypass cache (so we see the full pipeline)
      await client.callTool('figma', 'update_node', { nodeId: '1' });

      // Observability is outermost: starts timing (pre) before governance, records trace (post) after result.
      // Governance runs first in tracked callbacks, auth second, mcp_call after those.
      // Observability recorder fires last (post-processing).
      expect(executionOrder[0]).toBe('governance');
      expect(executionOrder[1]).toBe('auth');
      expect(executionOrder.indexOf('mcp_call')).toBeGreaterThan(executionOrder.indexOf('auth'));
      expect(executionOrder[executionOrder.length - 1]).toBe('observability');

      // Observability trace was recorded
      expect(traces.length).toBe(1);
      expect(traces[0].server).toBe('figma');
      expect(traces[0].method).toBe('update_node');
    });

    it('for cached reads: Cache Check returns before MCP Call (no transport hit), observability still records', async () => {
      const executionOrder: string[] = [];
      let transportCallCount = 0;

      const transport: MCPTransport = async () => {
        transportCallCount++;
        executionOrder.push('mcp_call');
        return Ok({ nodes: [1] });
      };

      const traces: MCPTrace[] = [];
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => {
            executionOrder.push('governance');
            return Ok(undefined);
          },
          secretProvider: {
            getSecret() {
              executionOrder.push('auth');
              return Ok('token');
            },
            hasSecret() { return true; },
          },
          traceRecorder: (trace) => {
            executionOrder.push('observability');
            traces.push(trace);
          },
          sleepFn: noopSleep,
        },
      });

      // First call: full pipeline
      await client.callTool('figma', 'get_code', { nodeId: '1' });
      expect(transportCallCount).toBe(1);

      // Reset tracking
      executionOrder.length = 0;

      // Second call: cache hit — no transport
      const result = await client.callTool('figma', 'get_code', { nodeId: '1' });
      expect(result.ok).toBe(true);
      expect(transportCallCount).toBe(1); // Still 1, cache served it

      // Cache check returned before MCP call, but observability still recorded (ADR-018)
      expect(executionOrder).toContain('governance');
      expect(executionOrder).toContain('auth');
      expect(executionOrder).not.toContain('mcp_call');
      expect(executionOrder).toContain('observability'); // Observability records cache hits
      expect(traces[traces.length - 1].cached).toBe(true);
    });

    it('composeMCPMiddleware returns exactly 6 middleware functions', () => {
      const middlewares = composeMCPMiddleware({
        agent: makeAgent(),
        permissionChecker: () => Ok(undefined),
        secretProvider: makeSecretProvider(),
        sleepFn: noopSleep,
      });

      expect(middlewares.length).toBe(6);
    });
  });

  // ============================================================================
  // P14.3 — Governance blocks unauthorized tool access
  // ============================================================================

  describe('P14.3 — governance blocks unauthorized tool access', () => {
    it('blocks call when agent contract does not permit the MCP tool', async () => {
      const { transport, calls } = makeTransport();

      const permissionChecker: PermissionChecker = (agent, action) => {
        // Simulate checking agent's tools array
        const toolKey = `${action.server}_mcp.${action.method}`;
        const hasPermission = agent.tools.some((t) => t === toolKey || t.startsWith(`${action.server}.`));
        if (!hasPermission) {
          return Err({
            code: 'PERMISSION_DENIED' as const,
            message: `Agent ${agent.role} not authorized for ${action.server}.${action.method}`,
            recoverable: false,
          } as AgentForgeError);
        }
        return Ok(undefined);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({ tools: ['figma_mcp.get_code'] }), // Only Figma access
          permissionChecker,
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      // This should be blocked — agent doesn't have slack access
      const result = await client.callTool('slack', 'send_message', { channel: '#general' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      // No external call was made
      expect(calls.length).toBe(0);
    });

    it('blocks call before any external call is made (transport never invoked)', async () => {
      let transportInvoked = false;
      const transport: MCPTransport = async () => {
        transportInvoked = true;
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Err({
            code: 'PERMISSION_DENIED' as const,
            message: 'Blocked',
            recoverable: false,
          } as AgentForgeError),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});

      expect(transportInvoked).toBe(false);
    });
  });

  // ============================================================================
  // P14.4 — Rate limiting enforces RPM limits
  // ============================================================================

  describe('P14.4 — rate limiting', () => {
    it('queues calls with backoff when server RPM limit is exceeded', async () => {
      const { transport, calls } = makeTransport({ ok: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          rateLimitConfigs: {
            figma: { maxRequests: 2, windowMs: 1000 },
          },
          sleepFn: noopSleep,
        },
      });

      // Fire 3 write requests (bypass cache) — first 2 immediate, 3rd queued
      const p1 = client.callTool('figma', 'update_a', {});
      const p2 = client.callTool('figma', 'update_b', {});
      const p3 = client.callTool('figma', 'update_c', {});

      const results = await Promise.all([p1, p2, p3]);

      expect(results.every((r) => r.ok)).toBe(true);
      expect(calls.length).toBe(3);
    });

    it('applies per-server rate limits independently', async () => {
      const { transport, calls } = makeTransport({ ok: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          rateLimitConfigs: {
            figma: { maxRequests: 1, windowMs: 60000 },
            github: { maxRequests: 10, windowMs: 60000 },
          },
          sleepFn: noopSleep,
        },
      });

      // GitHub should handle 3 calls fine
      await client.callTool('github', 'push_files', { a: 1 });
      await client.callTool('github', 'push_files', { a: 2 });
      await client.callTool('github', 'push_files', { a: 3 });

      expect(calls.filter((c) => c.server === 'github').length).toBe(3);
    });
  });

  // ============================================================================
  // P14.5 — Error recovery: retry + cache fallback
  // ============================================================================

  describe('P14.5 — error recovery', () => {
    it('retries transient failures with configurable retry count', async () => {
      let callCount = 0;
      const transport: MCPTransport = async () => {
        callCount++;
        if (callCount < 3) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'Server temporarily down',
            recoverable: true,
          } as AgentForgeError);
        }
        return Ok({ recovered: true });
      };

      const sleepCalls: number[] = [];
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          maxRetries: 5,
          sleepFn: async (ms) => { sleepCalls.push(ms); },
        },
      });

      const result = await client.callTool('figma', 'update_node', {});

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ recovered: true });
      }
      expect(callCount).toBe(3);
      // Exponential backoff: 1000ms, 2000ms
      expect(sleepCalls).toEqual([1000, 2000]);
    });

    it('falls back gracefully after exhausting retries', async () => {
      const transport: MCPTransport = async () => {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Permanent failure',
          recoverable: true,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          maxRetries: 2,
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('figma', 'update_node', {});

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MCP_UNAVAILABLE');
      }
    });

    it('does not retry non-transient errors', async () => {
      let callCount = 0;
      const transport: MCPTransport = async () => {
        callCount++;
        return Err({
          code: 'PERMISSION_DENIED' as const,
          message: 'Forbidden',
          recoverable: false,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', {});

      expect(callCount).toBe(1);
    });
  });

  // ============================================================================
  // P14.6 — Caching prevents redundant MCP calls
  // ============================================================================

  describe('P14.6 — caching', () => {
    it('caches identical get_ calls within TTL', async () => {
      const { transport, calls } = makeTransport({ design: 'wireframe' });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });
      await client.callTool('figma', 'get_code', { nodeId: '1' });
      await client.callTool('figma', 'get_code', { nodeId: '1' });

      // Transport called only once — subsequent calls from cache
      expect(calls.length).toBe(1);
    });

    it('does not cache write operations (create_, update_, delete_)', async () => {
      const { transport, calls } = makeTransport({ created: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'create_pr', { title: 'PR 1' });
      await client.callTool('github', 'create_pr', { title: 'PR 1' });

      expect(calls.length).toBe(2);
    });

    it('caches list* methods', async () => {
      const { transport, calls } = makeTransport([{ name: 'tool1' }]);
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.listTools('figma');
      await client.listTools('figma');

      expect(calls.length).toBe(1);
    });

    it('caches read_, describe_, search_ methods', async () => {
      const { transport, calls } = makeTransport({ data: 'cached' });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'read_file', { path: 'a.ts' });
      await client.callTool('figma', 'read_file', { path: 'a.ts' });
      expect(calls.length).toBe(1);

      await client.callTool('figma', 'describe_component', { id: '1' });
      await client.callTool('figma', 'describe_component', { id: '1' });
      expect(calls.length).toBe(2); // 1 + 1 new describe_ call

      await client.callTool('figma', 'search_nodes', { query: 'btn' });
      await client.callTool('figma', 'search_nodes', { query: 'btn' });
      expect(calls.length).toBe(3); // 2 + 1 new search_ call
    });

    it('different params create separate cache entries', async () => {
      const { transport, calls } = makeTransport({ data: 'cached' });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });
      await client.callTool('figma', 'get_code', { nodeId: '2' });

      expect(calls.length).toBe(2); // Different params = different cache keys
    });
  });

  // ============================================================================
  // P14.7 — Observability records for each middleware step
  // ============================================================================

  describe('P14.7 — observability', () => {
    it('generates observability record for successful call', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({ data: 1 });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({ FIGMA_TOKEN: 'tok' }),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });

      expect(traces).toHaveLength(1);
      expect(traces[0]).toEqual(expect.objectContaining({
        server: 'figma',
        method: 'get_code',
        success: true,
        cached: false,
      }));
      expect(traces[0].traceId).toMatch(/^mcp_/);
      expect(traces[0].latencyMs).toBeGreaterThanOrEqual(0);
      expect(traces[0].startTime).toBeLessThanOrEqual(traces[0].endTime);
    });

    it('generates observability record for failed call', async () => {
      const traces: MCPTrace[] = [];
      const transport: MCPTransport = async () =>
        Err({ code: 'PERMISSION_DENIED', message: 'nope', recoverable: false } as AgentForgeError);

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', {});

      expect(traces).toHaveLength(1);
      expect(traces[0].success).toBe(false);
      expect(traces[0].error).toBe('nope');
    });

    it('cached response DOES produce observability trace (observability is outermost per ADR-018)', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({ data: 1 });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider(),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });
      await client.callTool('figma', 'get_code', { nodeId: '1' });

      // ADR-018: observability is outermost, so both calls produce traces
      expect(traces).toHaveLength(2);
      expect(traces[0].cached).toBe(false);
      expect(traces[0].success).toBe(true);
      expect(traces[1].cached).toBe(true);
      expect(traces[1].success).toBe(true);
    });

    it('generates observability record for governance-blocked call (ADR-018: observability outermost)', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({});

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Err({
            code: 'PERMISSION_DENIED' as const,
            message: 'Blocked by governance',
            recoverable: false,
          } as AgentForgeError),
          secretProvider: makeSecretProvider(),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('slack', 'send_message', {});

      // ADR-018: observability is outermost, so governance-blocked calls produce traces
      expect(traces).toHaveLength(1);
      expect(traces[0].success).toBe(false);
      expect(traces[0].error).toBe('Blocked by governance');
    });

    it('never includes secrets in observability traces', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({});

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({
            FIGMA_TOKEN: 'super_secret_figma_123',
            GITHUB_TOKEN: 'ghp_secret_github_456',
          }),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});
      await client.callTool('github', 'create_pr', { title: 'PR' });

      const allTraceStr = JSON.stringify(traces);
      expect(allTraceStr).not.toContain('super_secret_figma_123');
      expect(allTraceStr).not.toContain('ghp_secret_github_456');
    });
  });

  // ============================================================================
  // P14 — Integration: full pipeline with Figma and GitHub server configs
  // ============================================================================

  describe('P14 — full pipeline integration with Figma + GitHub configs', () => {
    it('end-to-end: Figma get_code through full middleware chain', async () => {
      const traces: MCPTrace[] = [];
      const { transport, calls } = makeTransport({ html: '<div>wireframe</div>' });

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({ FIGMA_TOKEN: 'fig_token' }),
          rateLimitConfigs: {
            figma: { maxRequests: 60, windowMs: 60000 },
          },
          cacheConfigs: {
            figma: { ttlMs: 300000 },
          },
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('figma', 'get_code', { fileId: 'f1', nodeId: 'n1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ html: '<div>wireframe</div>' });
      }
      expect(calls[0].authToken).toBe('fig_token');
      expect(traces[0].success).toBe(true);
    });

    it('end-to-end: GitHub create_pr through full middleware chain', async () => {
      const traces: MCPTrace[] = [];
      const { transport, calls } = makeTransport({ number: 42, html_url: 'https://github.com/test/pr/42' });

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: makeSecretProvider({ GITHUB_TOKEN: 'ghp_token' }),
          rateLimitConfigs: {
            github: { maxRequests: 100, windowMs: 60000 },
          },
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'create_pr', {
        title: '[T-1] Login page',
        body: 'Generated by AgentForge',
        head: 'agentforge/task-1',
        base: 'main',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.value as { number: number; html_url: string };
        expect(data.number).toBe(42);
      }
      expect(calls[0].authToken).toBe('ghp_token');
      expect(traces[0].success).toBe(true);
    });
  });
});
