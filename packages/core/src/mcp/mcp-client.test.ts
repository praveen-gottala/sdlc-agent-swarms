import type { Result, AgentForgeError, AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import type { SecretProvider } from './secret-manager.js';
import type { MCPTransport, MCPTrace, PermissionChecker } from './mcp-middleware.js';
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
  tools: ['figma_mcp.get_code', 'github_mcp.create_pr'],
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

const makePermissionChecker = (
  allowed = true,
): PermissionChecker => {
  return (_agent, _action) => {
    if (allowed) return Ok(undefined);
    return Err({
      code: 'PERMISSION_DENIED' as const,
      message: 'MCP call not permitted',
      recoverable: false,
    } as AgentForgeError);
  };
};

const makeTransport = (
  response: unknown = { success: true },
): { transport: MCPTransport; calls: Array<{ server: string; method: string; authToken?: string }> } => {
  const calls: Array<{ server: string; method: string; authToken?: string }> = [];
  const transport: MCPTransport = async (request) => {
    calls.push({ server: request.server, method: request.method, authToken: request.authToken });
    return Ok(response);
  };
  return { transport, calls };
};

const noopSleep = async (_ms: number): Promise<void> => {};

// ============================================================================
// Tests
// ============================================================================

describe('MCPClient', () => {
  describe('callTool', () => {
    it('should call the transport and return data', async () => {
      const { transport, calls } = makeTransport({ tools: ['a'] });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('figma', 'get_code', { nodeId: '123' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ tools: ['a'] });
      }
      expect(calls.length).toBe(1);
      expect(calls[0].server).toBe('figma');
      expect(calls[0].method).toBe('get_code');
    });

    it('should block call when governance denies permission', async () => {
      const { transport, calls } = makeTransport();
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(false),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'deploy', {});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      // Transport should never be called
      expect(calls.length).toBe(0);
    });

    it('should inject auth token when secret is available', async () => {
      const { transport, calls } = makeTransport();
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider({ FIGMA_TOKEN: 'fig_secret' }),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});
      expect(calls[0].authToken).toBe('fig_secret');
    });

    it('should pass through without auth when no secret configured', async () => {
      const { transport, calls } = makeTransport();
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});
      expect(calls[0].authToken).toBeUndefined();
    });
  });

  describe('middleware chain order', () => {
    it('should execute middleware in correct order: governance → auth → rateLimit → cache → retry → observability', async () => {
      const executionOrder: string[] = [];

      // Track which middleware functions are hit by using a custom trace recorder
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport();

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: (_agent, _action) => {
            executionOrder.push('governance');
            return Ok(undefined);
          },
          secretProvider: {
            getSecret(_server, _key) {
              executionOrder.push('auth');
              return Err({ code: 'MCP_UNAVAILABLE', message: 'no secret', recoverable: false } as AgentForgeError);
            },
            hasSecret() { return false; },
          },
          traceRecorder: (trace) => {
            executionOrder.push('observability');
            traces.push(trace);
          },
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});

      // Governance should run first, auth second, observability last
      expect(executionOrder[0]).toBe('governance');
      expect(executionOrder[1]).toBe('auth');
      expect(executionOrder[executionOrder.length - 1]).toBe('observability');
      expect(traces.length).toBe(1);
      expect(traces[0].success).toBe(true);
    });
  });

  describe('caching', () => {
    it('should cache responses for get_ methods', async () => {
      const { transport, calls } = makeTransport({ nodes: [1, 2] });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const result1 = await client.callTool('figma', 'get_code', { nodeId: '1' });
      const result2 = await client.callTool('figma', 'get_code', { nodeId: '1' });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      // Transport called only once — second call served from cache
      expect(calls.length).toBe(1);
    });

    it('should not cache write operations', async () => {
      const { transport, calls } = makeTransport({ created: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'create_pr', { title: 'PR 1' });
      await client.callTool('github', 'create_pr', { title: 'PR 1' });

      // Both calls should hit the transport
      expect(calls.length).toBe(2);
    });

    it('should cache listTools responses', async () => {
      const tools = [{ name: 'get_code', description: 'Read code', inputSchema: {} }];
      const { transport, calls } = makeTransport(tools);
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const r1 = await client.listTools('figma');
      const r2 = await client.listTools('figma');

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(calls.length).toBe(1);
    });
  });

  describe('retry', () => {
    it('should retry transient failures with exponential backoff', async () => {
      let callCount = 0;
      const transport: MCPTransport = async () => {
        callCount++;
        if (callCount < 3) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'Server down',
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
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: async (ms) => { sleepCalls.push(ms); },
        },
      });

      // Use a write method to bypass cache
      const result = await client.callTool('figma', 'update_node', {});
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ recovered: true });
      }
      expect(callCount).toBe(3);
      // Exponential backoff: 1000, 2000
      expect(sleepCalls).toEqual([1000, 2000]);
    });

    it('should return MCP_UNAVAILABLE after exhausting retries', async () => {
      const transport: MCPTransport = async () => {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Server permanently down',
          recoverable: true,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
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

    it('should not retry non-transient errors', async () => {
      let callCount = 0;
      const transport: MCPTransport = async () => {
        callCount++;
        return Err({
          code: 'PERMISSION_DENIED' as const,
          message: 'Not allowed',
          recoverable: false,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'push_files', {});
      expect(result.ok).toBe(false);
      expect(callCount).toBe(1);
    });
  });

  describe('rate limiting', () => {
    it('should queue requests when rate limit is exceeded', async () => {
      const { transport, calls } = makeTransport({ ok: true });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          rateLimitConfigs: {
            figma: { maxRequests: 2, windowMs: 1000 },
          },
          sleepFn: noopSleep,
        },
      });

      // Fire 3 requests — first 2 should go immediately, 3rd should be queued
      const p1 = client.callTool('figma', 'update_a', {});
      const p2 = client.callTool('figma', 'update_b', {});
      const p3 = client.callTool('figma', 'update_c', {});

      // Wait for all (the queued one will resolve after the rate limit timer fires)
      const results = await Promise.all([p1, p2, p3]);

      expect(results.every((r) => r.ok)).toBe(true);
      expect(calls.length).toBe(3);
    });
  });

  describe('listTools', () => {
    it('should return tool definitions from MCP server', async () => {
      const tools = [
        { name: 'get_code', description: 'Read design code', inputSchema: {} },
        { name: 'generate_figma_design', description: 'Create design', inputSchema: {} },
      ];
      const { transport } = makeTransport(tools);
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const result = await client.listTools('figma');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].name).toBe('get_code');
      }
    });
  });

  describe('isAvailable', () => {
    it('should return true when server responds', async () => {
      const { transport } = makeTransport([]);
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const available = await client.isAvailable('figma');
      expect(available).toBe(true);
    });

    it('should return false when server is unreachable', async () => {
      const transport: MCPTransport = async () => {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Connection refused',
          recoverable: false,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          sleepFn: noopSleep,
        },
      });

      const available = await client.isAvailable('figma');
      expect(available).toBe(false);
    });
  });

  describe('observability', () => {
    it('should record trace with timing information', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({ data: 1 });
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider(),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', { nodeId: '1' });

      expect(traces).toHaveLength(1);
      expect(traces[0].server).toBe('figma');
      expect(traces[0].method).toBe('get_code');
      expect(traces[0].success).toBe(true);
      expect(traces[0].latencyMs).toBeGreaterThanOrEqual(0);
      expect(traces[0].traceId).toMatch(/^mcp_/);
    });

    it('should record failure in trace', async () => {
      const traces: MCPTrace[] = [];
      const transport: MCPTransport = async () =>
        Err({ code: 'PERMISSION_DENIED', message: 'nope', recoverable: false } as AgentForgeError);

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
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

    it('should never include secrets in traces', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({});
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: makePermissionChecker(true),
          secretProvider: makeSecretProvider({ FIGMA_TOKEN: 'super_secret_123' }),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'get_code', {});

      const traceStr = JSON.stringify(traces);
      expect(traceStr).not.toContain('super_secret_123');
    });
  });
});
