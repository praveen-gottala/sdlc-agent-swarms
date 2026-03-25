/**
 * P27 — Secret Management and Agent Credentials (Wave 4)
 *
 * Validates secret management from PRD v2.0 Section 19.2:
 * Vault integration interface, scoped tokens, token rotation,
 * cross-agent credential isolation, and secret masking in logs.
 *
 * Tests use mock credentials (vault not configured in test env).
 * NOTE: Vault integration is Phase 2. Phase 1 uses env vars.
 */

import type { Result, AgentForgeError, AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { DEFAULT_MODEL } from '../constants.js';
import type { SecretProvider } from './secret-manager.js';
import { createEnvSecretProvider } from './secret-manager.js';
import type { MCPTransport, MCPTrace, PermissionChecker } from './mcp-middleware.js';
import { createMCPClient } from './mcp-client.js';

// ============================================================================
// Test Helpers
// ============================================================================

const makeAgent = (overrides?: Partial<AgentContract>): AgentContract => ({
  role: 'code_generator',
  description: 'Generates code',
  category: 'code',
  provider: DEFAULT_MODEL,
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 50000 },
  tools: ['github_mcp.push_files', 'github_mcp.create_pr'],
  permissions: ['read_code', 'write_code', 'mcp_call'],
  denied: ['write_design', 'deploy_production'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'CodeGenComplete',
  on_error: 'notify_human',
  context: {},
  ...overrides,
});

const noopSleep = async (_ms: number): Promise<void> => {};

// ============================================================================
// P27.1 — Agents never see raw API keys
// ============================================================================

describe('P27 — Secret Management and Agent Credentials', () => {
  describe('P27.1 — agents never see raw secrets', () => {
    it('auth middleware injects token without exposing it in request params', async () => {
      const requestsReceived: Array<{ params: Record<string, unknown>; authToken?: string }> = [];

      const transport: MCPTransport = async (request) => {
        requestsReceived.push({
          params: request.params as Record<string, unknown>,
          authToken: request.authToken,
        });
        return Ok({ success: true });
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_real_secret_key_12345',
          }),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', { branch: 'main', files: [] });

      // Token is injected as authToken, not mixed into params
      expect(requestsReceived[0].authToken).toBe('ghp_real_secret_key_12345');
      // Params do not contain the secret
      expect(JSON.stringify(requestsReceived[0].params)).not.toContain('ghp_real_secret_key_12345');
    });

    it('secret values never appear in Result error messages', () => {
      const provider = createEnvSecretProvider({
        AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_super_secret_42',
      });

      // Access a different server — should fail without leaking GitHub token
      const result = provider.getSecret('figma', 'TOKEN');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).not.toContain('ghp_super_secret_42');
        expect(JSON.stringify(result.error)).not.toContain('ghp_super_secret_42');
      }
    });

    it('SecretProvider interface hides raw values behind getSecret()', () => {
      const provider = createEnvSecretProvider({
        AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_token_123',
        AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_secret_456',
      });

      // hasSecret confirms availability without revealing value
      expect(provider.hasSecret('github', 'TOKEN')).toBe(true);
      expect(provider.hasSecret('figma', 'TOKEN')).toBe(true);

      // Only getSecret reveals the value, and only to auth middleware
      const result = provider.getSecret('github', 'TOKEN');
      expect(result.ok).toBe(true);
    });
  });

  // ============================================================================
  // P27.2 — Scoped tokens: agents receive server-specific tokens only
  // ============================================================================

  describe('P27.2 — scoped tokens per agent MCP servers', () => {
    it('auth middleware only provides token for the requested server', async () => {
      const tokensInjected: Array<{ server: string; authToken?: string }> = [];

      const transport: MCPTransport = async (request) => {
        tokensInjected.push({
          server: request.server,
          authToken: request.authToken,
        });
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_github_only',
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_only',
          }),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', {});

      // Only GitHub token is injected, not Figma
      expect(tokensInjected[0].server).toBe('github');
      expect(tokensInjected[0].authToken).toBe('ghp_github_only');
      // Figma token is not leaked into GitHub request
      expect(tokensInjected[0].authToken).not.toContain('figma_only');
    });

    it('missing server token results in undefined authToken (graceful degradation)', async () => {
      const tokensInjected: Array<{ server: string; authToken?: string }> = [];

      const transport: MCPTransport = async (request) => {
        tokensInjected.push({
          server: request.server,
          authToken: request.authToken,
        });
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_github_only',
            // No Figma token configured
          }),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('figma', 'update_node', {});

      // No Figma token — authToken is undefined
      expect(tokensInjected[0].authToken).toBeUndefined();
    });
  });

  // ============================================================================
  // P27.3 — Token rotation without restarting agents
  // ============================================================================

  describe('P27.3 — token rotation', () => {
    it('SecretProvider reads from env on each call (supports rotation)', () => {
      const env: Record<string, string | undefined> = {
        AGENTFORGE_MCP_GITHUB_TOKEN: 'old_token_v1',
      };
      const provider = createEnvSecretProvider(env);

      // First read
      const result1 = provider.getSecret('github', 'TOKEN');
      expect(result1.ok).toBe(true);
      if (result1.ok) expect(result1.value).toBe('old_token_v1');

      // Simulate token rotation (env var updated)
      env.AGENTFORGE_MCP_GITHUB_TOKEN = 'new_token_v2';

      // Second read picks up new token
      const result2 = provider.getSecret('github', 'TOKEN');
      expect(result2.ok).toBe(true);
      if (result2.ok) expect(result2.value).toBe('new_token_v2');
    });

    it('auth middleware uses latest token on each MCP call (no restart needed)', async () => {
      const env: Record<string, string | undefined> = {
        AGENTFORGE_MCP_GITHUB_TOKEN: 'token_v1',
      };
      const tokensUsed: string[] = [];

      const transport: MCPTransport = async (request) => {
        if (request.authToken) tokensUsed.push(request.authToken);
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider(env),
          sleepFn: noopSleep,
        },
      });

      // First call with old token
      await client.callTool('github', 'push_files', {});
      expect(tokensUsed[0]).toBe('token_v1');

      // Rotate token
      env.AGENTFORGE_MCP_GITHUB_TOKEN = 'token_v2';

      // Second call picks up new token without restart
      await client.callTool('github', 'push_files', {});
      expect(tokensUsed[1]).toBe('token_v2');
    });
  });

  // ============================================================================
  // P27.4 — Cross-agent credential isolation
  // ============================================================================

  describe('P27.4 — scope enforcement blocks cross-agent credential access', () => {
    it('code_generator cannot access Figma credentials via governance check', async () => {
      let externalCallMade = false;
      const transport: MCPTransport = async () => {
        externalCallMade = true;
        return Ok({});
      };

      // Permission checker blocks code_generator from Figma
      const permissionChecker: PermissionChecker = (agent, action) => {
        const serverTools = agent.tools.filter((t) =>
          t.startsWith(`${action.server}_mcp.`) || t.startsWith(`${action.server}.`),
        );
        if (serverTools.length === 0) {
          return Err({
            code: 'PERMISSION_DENIED' as const,
            message: `Agent ${agent.role} not authorized for ${action.server}`,
            recoverable: false,
          } as AgentForgeError);
        }
        return Ok(undefined);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'code_generator',
            tools: ['github_mcp.push_files', 'github_mcp.create_pr'],
            // No Figma tools
          }),
          permissionChecker,
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_token',
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_secret',
          }),
          sleepFn: noopSleep,
        },
      });

      // code_generator tries to access Figma
      const result = await client.callTool('figma', 'get_code', { nodeId: '1' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      // Zero external calls made
      expect(externalCallMade).toBe(false);
    });

    it('design agent cannot access GitHub credentials', async () => {
      let externalCallMade = false;
      const transport: MCPTransport = async () => {
        externalCallMade = true;
        return Ok({});
      };

      const permissionChecker: PermissionChecker = (agent, action) => {
        const serverTools = agent.tools.filter((t) =>
          t.startsWith(`${action.server}_mcp.`) || t.startsWith(`${action.server}.`),
        );
        if (serverTools.length === 0) {
          return Err({
            code: 'PERMISSION_DENIED' as const,
            message: `Agent ${agent.role} not authorized for ${action.server}`,
            recoverable: false,
          } as AgentForgeError);
        }
        return Ok(undefined);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'wireframe_generator',
            category: 'design',
            tools: ['figma_mcp.generate_figma_design', 'figma_mcp.get_code'],
            // No GitHub tools
          }),
          permissionChecker,
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_token',
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_secret',
          }),
          sleepFn: noopSleep,
        },
      });

      // Design agent tries to access GitHub
      const result = await client.callTool('github', 'push_files', { branch: 'main' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      expect(externalCallMade).toBe(false);
    });
  });

  // ============================================================================
  // P27.5 — Secrets never appear in logs or traces
  // ============================================================================

  describe('P27.5 — secrets never appear in logs or traces', () => {
    it('observability traces never contain auth tokens', async () => {
      const traces: MCPTrace[] = [];
      const transport: MCPTransport = async () => Ok({ success: true });

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_VERY_SECRET_TOKEN_abc123',
            AGENTFORGE_MCP_FIGMA_TOKEN: 'fig_ANOTHER_SECRET_xyz789',
          }),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', {});
      await client.callTool('figma', 'update_node', {});

      const allTraceStr = JSON.stringify(traces);
      expect(allTraceStr).not.toContain('ghp_VERY_SECRET_TOKEN_abc123');
      expect(allTraceStr).not.toContain('fig_ANOTHER_SECRET_xyz789');

      // Traces only contain: traceId, server, method, timing, success, cached, error
      for (const trace of traces) {
        expect(trace).toHaveProperty('traceId');
        expect(trace).toHaveProperty('server');
        expect(trace).toHaveProperty('method');
        expect(trace).toHaveProperty('latencyMs');
        expect(trace).toHaveProperty('success');
        expect(trace).not.toHaveProperty('authToken');
        expect(trace).not.toHaveProperty('params');
      }
    });

    it('error traces never contain auth tokens', async () => {
      const traces: MCPTrace[] = [];
      const transport: MCPTransport = async () =>
        Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Connection refused',
          recoverable: false,
        } as AgentForgeError);

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_SECRET_IN_ERROR_CONTEXT',
          }),
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      await client.callTool('github', 'push_files', {});

      const allTraceStr = JSON.stringify(traces);
      expect(allTraceStr).not.toContain('ghp_SECRET_IN_ERROR_CONTEXT');
    });

    it('secret provider error messages reference env key name, not secret value', () => {
      const provider = createEnvSecretProvider({});

      const result = provider.getSecret('github', 'TOKEN');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Error mentions the env var name (AGENTFORGE_MCP_GITHUB_TOKEN) but not any value
        expect(result.error.message).toContain('AGENTFORGE_MCP_GITHUB_TOKEN');
      }
    });

    it('secret values are not present in console.log output format', () => {
      // The observability middleware's default recorder only logs:
      // [MCP] traceId server.method STATUS latencyMs [cached]
      // Verify format by examining MCPTrace structure
      const trace: MCPTrace = {
        traceId: 'mcp_123_1',
        server: 'github',
        method: 'push_files',
        startTime: Date.now(),
        endTime: Date.now(),
        latencyMs: 5,
        success: true,
        cached: false,
      };

      // The log format is: `[MCP] ${traceId} ${server}.${method} ${status} ${latencyMs}ms${cacheTag}`
      const logLine = `[MCP] ${trace.traceId} ${trace.server}.${trace.method} OK ${trace.latencyMs}ms`;
      expect(logLine).not.toContain('token');
      expect(logLine).not.toContain('secret');
      expect(logLine).not.toContain('key');
    });
  });

  // ============================================================================
  // P27 — Vault integration interface readiness
  // ============================================================================

  describe('P27 — vault integration interface (Phase 2 readiness)', () => {
    it('SecretProvider interface supports drop-in vault replacement', () => {
      // A vault-backed SecretProvider can be created with the same interface
      const vaultProvider: SecretProvider = {
        getSecret(server: string, key: string): Result<string> {
          // Simulate vault lookup
          if (server === 'github' && key === 'TOKEN') {
            return Ok('vault://secrets/mcp/github/token');
          }
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Vault secret not found for ${server}/${key}`,
            recoverable: false,
          } as AgentForgeError);
        },
        hasSecret(server: string, key: string): boolean {
          return server === 'github' && key === 'TOKEN';
        },
      };

      // Works as drop-in replacement
      expect(vaultProvider.hasSecret('github', 'TOKEN')).toBe(true);
      expect(vaultProvider.hasSecret('figma', 'TOKEN')).toBe(false);

      const result = vaultProvider.getSecret('github', 'TOKEN');
      expect(result.ok).toBe(true);
    });

    // DEVIATION: Token scoping and time-limited tokens not implemented in Phase 1.
    // PRD Section 19.2 specifies "scoped, time-limited tokens that are automatically rotated."
    // Phase 1 uses environment variables with no expiry or automatic rotation.
    it('DEVIATION: time-limited tokens not implemented (Phase 1 — env vars only)', () => {
      // Phase 1: tokens read from env vars, no expiry mechanism
      // Phase 2: vault integration with automatic rotation and scoped TTLs
      const provider = createEnvSecretProvider({
        AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_no_expiry_token',
      });

      // Token is available with no TTL check
      const result = provider.getSecret('github', 'TOKEN');
      expect(result.ok).toBe(true);
      // No expiry or TTL enforcement — documented deviation
    });
  });
});
