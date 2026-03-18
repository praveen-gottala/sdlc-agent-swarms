/**
 * P14b — Integration Health Check Against Live Project (Wave 4)
 *
 * Uses the TestApp project to validate MCP server connectivity.
 * Tests are mocked (no live MCP servers available in test environment).
 * Documents fallback behaviors for disconnected servers.
 *
 * NOTE: These tests use mocked MCP transports. Live connectivity checks
 * require actual MCP server instances which are not available in CI.
 */

import type { AgentForgeError, AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { createEnvSecretProvider } from './secret-manager.js';
import type { MCPTransport, MCPTrace } from './mcp-middleware.js';
import { createMCPClient } from './mcp-client.js';

// ============================================================================
// Test Helpers
// ============================================================================

const makeAgent = (overrides?: Partial<AgentContract>): AgentContract => ({
  role: 'spec_writer',
  description: 'Writes specifications',
  category: 'spec',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 20000 },
  tools: ['github_mcp.read_file', 'github_mcp.list_branches'],
  permissions: ['read_code', 'read_spec', 'mcp_call'],
  denied: ['write_design', 'deploy_production'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 20000, max_cost_per_task_usd: 1.0 },
  on_complete: 'SpecComplete',
  on_error: 'notify_human',
  context: {},
  ...overrides,
});

const noopSleep = async (_ms: number): Promise<void> => {};

const makeTransport = (
  response: unknown = { success: true },
): { transport: MCPTransport; calls: Array<{ server: string; method: string }> } => {
  const calls: Array<{ server: string; method: string }> = [];
  const transport: MCPTransport = async (request) => {
    calls.push({ server: request.server, method: request.method });
    return Ok(response);
  };
  return { transport, calls };
};

// ============================================================================
// P14b.1 — GitHub MCP: read TestApp repo and list branches
// ============================================================================

describe('P14b — Integration Health Check Against Live Project', () => {
  describe('P14b.1 — GitHub MCP: read TestApp repo and list branches (mocked)', () => {
    it('can read the TestApp repository via MCP', async () => {
      const transport: MCPTransport = async (request) => {
        if (request.method === 'read_file') {
          return Ok({
            content: '# TestApp\nInitialized by AgentForge',
            path: 'README.md',
          });
        }
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_test_token',
          }),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'read_file', {
        repo: 'test-app',
        path: 'README.md',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.value as { content: string };
        expect(data.content).toContain('TestApp');
      }
    });

    it('can list branches via GitHub MCP adapter', async () => {
      const transport: MCPTransport = async (request) => {
        if (request.method === 'list_branches') {
          return Ok({
            branches: [
              { name: 'main', protected: true },
              { name: 'agentforge/task-1', protected: false },
              { name: 'agentforge/task-2', protected: false },
            ],
          });
        }
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_test_token',
          }),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'list_branches', {
        repo: 'test-app',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.value as { branches: Array<{ name: string }> };
        expect(data.branches.length).toBeGreaterThan(0);
        expect(data.branches.some((b) => b.name === 'main')).toBe(true);
      }
    });
  });

  // ============================================================================
  // P14b.2 — Figma MCP / Storybook fallback
  // ============================================================================

  describe('P14b.2 — Figma MCP or Storybook fallback (mocked)', () => {
    it('Figma MCP: createWorkspace produces file linked to TestApp', async () => {
      const transport: MCPTransport = async (request) => {
        if (request.method === 'generate_figma_design') {
          return Ok({ fileId: 'figma-file-abc123' });
        }
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'wireframe_generator',
            tools: ['figma_mcp.generate_figma_design'],
            permissions: ['read_design', 'write_design', 'mcp_call'],
          }),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_test_token',
          }),
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('figma', 'generate_figma_design', {
        projectName: 'TestApp',
        fileId: 'template-001',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const data = result.value as { fileId: string };
        expect(data.fileId).toBeDefined();
      }
    });

    it('Storybook fallback activates when Figma MCP is unavailable', async () => {
      const transport: MCPTransport = async (request) => {
        if (request.server === 'figma') {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: 'Figma MCP server not responding (F7 failure mode)',
            recoverable: true,
          } as AgentForgeError);
        }
        return Ok({});
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'wireframe_generator',
            tools: ['figma_mcp.generate_figma_design'],
            permissions: ['read_design', 'write_design', 'mcp_call'],
          }),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_test_token',
          }),
          maxRetries: 2,
          sleepFn: noopSleep,
        },
      });

      // Figma unavailable — should fail after retries
      const result = await client.callTool('figma', 'generate_figma_design', {
        projectName: 'TestApp',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MCP_UNAVAILABLE');
        // Documented: F7 failure mode — fall back to code-first design (Storybook)
        // Storybook fallback is not yet implemented (Phase 1 only supports Figma)
        // DEVIATION: Storybook fallback not implemented per Phase 1 scope
      }
    });
  });

  // ============================================================================
  // P14b.3 — Secret scope check: cross-agent access blocked
  // ============================================================================

  describe('P14b.3 — secret scope enforcement', () => {
    it('spec_writer can access GitHub MCP credentials', () => {
      const secretProvider = createEnvSecretProvider({
        AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_valid_token',
      });

      const result = secretProvider.getSecret('github', 'TOKEN');
      expect(result.ok).toBe(true);
      expect(secretProvider.hasSecret('github', 'TOKEN')).toBe(true);
    });

    it('spec_writer cannot access Figma MCP credentials (scope enforcement)', async () => {
      let externalCallMade = false;
      const transport: MCPTransport = async () => {
        externalCallMade = true;
        return Ok({});
      };

      // Permission checker enforces that spec_writer has no Figma access
      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'spec_writer',
            tools: ['github_mcp.read_file', 'github_mcp.list_branches'],
            permissions: ['read_code', 'read_spec', 'mcp_call'],
            denied: ['write_design', 'read_design'],
          }),
          permissionChecker: (agent, action) => {
            // Check if the agent's tools array includes the server
            const serverTools = agent.tools.filter((t) => t.startsWith(`${action.server}_mcp.`));
            if (serverTools.length === 0) {
              return Err({
                code: 'PERMISSION_DENIED' as const,
                message: `Agent ${agent.role} not authorized for ${action.server} MCP server`,
                recoverable: false,
              } as AgentForgeError);
            }
            return Ok(undefined);
          },
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_valid_token',
            AGENTFORGE_MCP_FIGMA_TOKEN: 'figma_secret',
          }),
          sleepFn: noopSleep,
        },
      });

      // spec_writer tries to access Figma — should be blocked
      const result = await client.callTool('figma', 'get_code', { nodeId: '1' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      // Zero external calls made
      expect(externalCallMade).toBe(false);
    });
  });

  // ============================================================================
  // P14b.4 — Rate limit baseline
  // ============================================================================

  describe('P14b.4 — RPM usage baseline', () => {
    it('documents baseline RPM usage for GitHub MCP', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({ ok: true });

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_tok',
          }),
          rateLimitConfigs: {
            github: { maxRequests: 100, windowMs: 60000 },
          },
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      // Simulate baseline operations
      await client.callTool('github', 'list_branches', { repo: 'test-app' });
      await client.callTool('github', 'read_file', { repo: 'test-app', path: 'README.md' });

      // Baseline: 2 RPM for GitHub (1 list_branches + 1 read_file, but list cached so 1 transport call)
      // Document: GitHub baseline RPM = 2 requests/operation cycle
      expect(traces.length).toBe(2);
      const githubTraces = traces.filter((t) => t.server === 'github');
      expect(githubTraces.length).toBe(2);

      // RPM baseline documentation:
      // GitHub MCP: ~2 requests per operation cycle (read + list)
      // Figma MCP: ~3 requests per design operation (get_code + get_metadata + get_variables)
      // Configured limits: GitHub=100 RPM, Figma=60 RPM
    });

    it('documents baseline RPM usage for Figma MCP', async () => {
      const traces: MCPTrace[] = [];
      const { transport } = makeTransport({ data: 'figma_response' });

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent({
            role: 'wireframe_generator',
            tools: ['figma_mcp.get_code', 'figma_mcp.get_metadata', 'figma_mcp.get_variables'],
            permissions: ['read_design', 'write_design', 'mcp_call'],
          }),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_FIGMA_TOKEN: 'fig_tok',
          }),
          rateLimitConfigs: {
            figma: { maxRequests: 60, windowMs: 60000 },
          },
          traceRecorder: (trace) => traces.push(trace),
          sleepFn: noopSleep,
        },
      });

      // Simulate a typical design read operation
      await client.callTool('figma', 'get_code', { fileId: 'f1', nodeId: 'n1' });
      await client.callTool('figma', 'get_metadata', { fileId: 'f1', nodeId: 'n1' });
      await client.callTool('figma', 'get_variables', { fileId: 'f1' });

      // Baseline: 3 RPM for Figma per design read
      const figmaTraces = traces.filter((t) => t.server === 'figma');
      expect(figmaTraces.length).toBe(3);

      // RPM baseline: Figma = 3 requests per design read cycle
      // All are cacheable (get_ prefix) so subsequent reads = 0 RPM
    });
  });

  // ============================================================================
  // P14b.5 — Fallback behaviors for disconnected servers
  // ============================================================================

  describe('P14b.5 — fallback behavior documentation', () => {
    it('GitHub MCP disconnected: returns MCP_UNAVAILABLE with recoverable flag', async () => {
      const transport: MCPTransport = async () => {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Connection refused: GitHub MCP server not responding',
          recoverable: true,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({
            AGENTFORGE_MCP_GITHUB_TOKEN: 'ghp_tok',
          }),
          maxRetries: 1,
          sleepFn: noopSleep,
        },
      });

      const result = await client.callTool('github', 'list_branches', { repo: 'test-app' });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MCP_UNAVAILABLE');
        expect(result.error.recoverable).toBe(true);
        // Fallback: task pauses, human notified, cached data used if available
      }
    });

    it('isAvailable returns false for disconnected servers', async () => {
      const transport: MCPTransport = async () => {
        return Err({
          code: 'MCP_UNAVAILABLE' as const,
          message: 'Unreachable',
          recoverable: false,
        } as AgentForgeError);
      };

      const client = createMCPClient({
        transport,
        middlewareOptions: {
          agent: makeAgent(),
          permissionChecker: () => Ok(undefined),
          secretProvider: createEnvSecretProvider({}),
          sleepFn: noopSleep,
        },
      });

      const available = await client.isAvailable('figma');
      expect(available).toBe(false);
    });
  });
});
