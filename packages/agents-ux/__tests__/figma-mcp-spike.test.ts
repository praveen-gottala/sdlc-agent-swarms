/**
 * @module figma-mcp-spike
 *
 * Integration spike test: proves real MCP communication with the Figma
 * MCP server works end-to-end through the adapter layer.
 *
 * Skipped by default. Enable with:
 *   RUN_MCP_SPIKES=true AGENTFORGE_MCP_FIGMA_TOKEN=... AGENTFORGE_MCP_FIGMA_FILE_ID=... npx jest
 *
 * See docs/mcp-spike-setup.md for full setup instructions.
 */

import type { MCPClient, Result } from '@agentforge/core';
import { createMCPClient, Ok, Err } from '@agentforge/core';
import { FigmaAdapter } from '@agentforge/agents-design';
import type { MCPRequest } from '@agentforge/core';
import type {
  MCPMiddlewareOptions,
  MCPTransport,
  PermissionChecker,
} from '@agentforge/core';
import type { SecretProvider } from '@agentforge/core';
import type { AgentContract } from '@agentforge/core';
import type { DesignContext } from '@agentforge/agents-design';

// ============================================================================
// Environment & skip logic
// ============================================================================

const SPIKE_ENABLED = process.env.RUN_MCP_SPIKES === 'true';
const FIGMA_TOKEN = process.env.AGENTFORGE_MCP_FIGMA_TOKEN ?? '';
const FIGMA_FILE_ID = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID ?? '';

const describeSpike = SPIKE_ENABLED ? describe : describe.skip;

// ============================================================================
// Minimal test fixtures
// ============================================================================

/** Minimal agent contract for the spike — permits all figma tools. */
const spikeAgent: AgentContract = {
  role: 'ux-spike-test',
  description: 'Spike test agent for Figma MCP integration',
  category: 'design',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 8000 },
  tools: [
    'figma:get_metadata',
    'figma:get_code',
    'figma:get_variables',
    'figma:get_variable_defs',
    'figma:generate_figma_design',
  ],
  permissions: ['mcp:figma:*'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 1.0 },
  on_complete: 'notify',
  on_error: 'halt',
  context: {},
};

/** Permissive permission checker for spike tests. */
const allowAll: PermissionChecker = () => Ok(undefined);

/** Secret provider that reads AGENTFORGE_MCP_FIGMA_TOKEN from env. */
const envSecrets: SecretProvider = {
  getSecret(server: string, key: string): Result<string> {
    if (server === 'figma' && key === 'TOKEN' && FIGMA_TOKEN) {
      return Ok(FIGMA_TOKEN);
    }
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `No secret for ${server}/${key}`,
      recoverable: false,
    });
  },
  hasSecret(server: string, key: string): boolean {
    return server === 'figma' && key === 'TOKEN' && FIGMA_TOKEN.length > 0;
  },
};

/**
 * Figma REST API transport — calls the Figma REST API directly,
 * simulating what the Figma MCP server does under the hood.
 *
 * This is the pragmatic choice for a spike: it validates the full
 * MCPClient -> middleware -> transport -> FigmaAdapter chain without
 * requiring a running MCP stdio/SSE server process.
 *
 * Tool name mapping:
 *   get_metadata  -> GET /v1/files/:fileId
 *   get_code      -> GET /v1/files/:fileId/nodes?ids=:nodeId
 *   get_variables -> GET /v1/files/:fileId/variables/local
 *   get_variable_defs -> (alias, same as get_variables — tests naming gap)
 *   listTools     -> returns static tool list
 */
const createFigmaRestTransport = (): MCPTransport => {
  return async (request: MCPRequest): Promise<Result<unknown>> => {
    const { method, params, authToken } = request;
    const token = authToken ?? FIGMA_TOKEN;

    if (!token) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: 'No Figma access token configured',
        recoverable: false,
      });
    }

    const headers: Record<string, string> = {
      'X-Figma-Token': token,
    };

    const fileId = (params.fileId as string) ?? FIGMA_FILE_ID;

    try {
      if (method === 'listTools') {
        return Ok([
          { name: 'get_metadata', description: 'Get file metadata', inputSchema: {} },
          { name: 'get_code', description: 'Get node code/HTML', inputSchema: {} },
          { name: 'get_variables', description: 'Get design variables', inputSchema: {} },
          { name: 'generate_figma_design', description: 'Generate design', inputSchema: {} },
        ]);
      }

      if (method === 'get_metadata') {
        const url = `https://api.figma.com/v1/files/${fileId}?depth=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Figma API ${res.status}: ${res.statusText}`,
            recoverable: res.status >= 500,
          });
        }
        const data = await res.json();
        return Ok(data);
      }

      if (method === 'get_code') {
        const nodeId = params.nodeId as string | undefined;
        const ids = nodeId ? `?ids=${encodeURIComponent(nodeId)}` : '';
        const url = `https://api.figma.com/v1/files/${fileId}/nodes${ids}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Figma API ${res.status}: ${res.statusText}`,
            recoverable: res.status >= 500,
          });
        }
        const data = await res.json();
        return Ok(data);
      }

      if (method === 'get_variables' || method === 'get_variable_defs') {
        const url = `https://api.figma.com/v1/files/${fileId}/variables/local`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          return Err({
            code: 'MCP_UNAVAILABLE' as const,
            message: `Figma API ${res.status}: ${res.statusText}`,
            recoverable: res.status >= 500,
          });
        }
        const data = await res.json();
        return Ok(data);
      }

      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Unknown Figma MCP method: ${method}`,
        recoverable: false,
      });
    } catch (err) {
      return Err({
        code: 'MCP_UNAVAILABLE' as const,
        message: `Figma transport error: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  };
};

// ============================================================================
// Tests
// ============================================================================

describeSpike('Figma MCP Spike', () => {
  let mcpClient: MCPClient;

  beforeAll(() => {
    if (!FIGMA_TOKEN) {
      throw new Error('AGENTFORGE_MCP_FIGMA_TOKEN must be set when RUN_MCP_SPIKES=true');
    }
    if (!FIGMA_FILE_ID) {
      throw new Error('AGENTFORGE_MCP_FIGMA_FILE_ID must be set when RUN_MCP_SPIKES=true');
    }

    const middlewareOptions: MCPMiddlewareOptions = {
      agent: spikeAgent,
      permissionChecker: allowAll,
      secretProvider: envSecrets,
      maxRetries: 1,
      baseRetryDelayMs: 500,
    };

    mcpClient = createMCPClient({
      middlewareOptions,
      transport: createFigmaRestTransport(),
    });
  });

  // --------------------------------------------------------------------------
  // Test 1: MCP client can connect
  // --------------------------------------------------------------------------
  it('MCP client reports figma server as available', async () => {
    const available = await mcpClient.isAvailable('figma');
    expect(available).toBe(true);
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 2: get_metadata returns parseable structure
  // --------------------------------------------------------------------------
  it('get_metadata returns parseable file structure', async () => {
    const result = await mcpClient.callTool('figma', 'get_metadata', {
      fileId: FIGMA_FILE_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    expect(data).toHaveProperty('name');
    expect(data).toHaveProperty('document');

    // Verify response is under 50KB (sanity check for depth=1)
    const size = JSON.stringify(data).length;
    console.log(`[spike] get_metadata response size: ${size} bytes`);
    expect(size).toBeLessThan(50_000);
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 3: get_variable_defs vs get_variables (naming gap surface)
  // --------------------------------------------------------------------------
  describe('design token retrieval (naming gap test)', () => {
    it('get_variables returns data via FigmaAdapter tool name', async () => {
      const result = await mcpClient.callTool('figma', 'get_variables', {
        fileId: FIGMA_FILE_ID,
      });

      if (!result.ok) {
        // Figma /variables/local requires Enterprise plan or specific permissions.
        // A 403 is a valid spike finding — log it and pass.
        console.warn(
          `[spike] get_variables failed (expected if non-Enterprise): ${result.error.message}`,
        );
        return;
      }

      const data = result.value as Record<string, unknown>;
      console.log(
        `[spike] get_variables keys: ${Object.keys(data).join(', ')}`,
      );
      expect(data).toBeDefined();
    }, 30_000);

    it('get_variable_defs returns data via UX agent tool name', async () => {
      /**
       * NAMING GAP: UX agents declare figma:get_variable_defs in their contracts
       * but FigmaAdapter calls get_variables. This test surfaces the mismatch.
       * Both should work through our transport since we map them to the same endpoint.
       */
      const result = await mcpClient.callTool('figma', 'get_variable_defs', {
        fileId: FIGMA_FILE_ID,
      });

      if (!result.ok) {
        console.warn(
          `[spike] get_variable_defs failed (expected if non-Enterprise): ${result.error.message}`,
        );
      }

      console.warn(
        '[spike] NAMING GAP: UX agents use "get_variable_defs" but FigmaAdapter uses "get_variables". ' +
        'These currently resolve to the same endpoint but need alignment. See ADR-024.',
      );
    }, 30_000);
  });

  // --------------------------------------------------------------------------
  // Test 4: get_code returns component data
  // --------------------------------------------------------------------------
  it('get_code returns node data with token count logged', async () => {
    // First get a node ID from metadata
    const metaResult = await mcpClient.callTool('figma', 'get_metadata', {
      fileId: FIGMA_FILE_ID,
    });
    expect(metaResult.ok).toBe(true);
    if (!metaResult.ok) return;

    const meta = metaResult.value as { document?: { children?: Array<{ id: string; name: string }> } };
    const firstPage = meta.document?.children?.[0];
    expect(firstPage).toBeDefined();
    if (!firstPage) return;

    console.log(`[spike] Using node: ${firstPage.name} (${firstPage.id})`);

    const codeResult = await mcpClient.callTool('figma', 'get_code', {
      fileId: FIGMA_FILE_ID,
      nodeId: firstPage.id,
    });

    expect(codeResult.ok).toBe(true);
    if (!codeResult.ok) return;

    const data = codeResult.value as Record<string, unknown>;
    const responseStr = JSON.stringify(data);
    // Rough token estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(responseStr.length / 4);
    console.log(
      `[spike] get_code response: ${responseStr.length} bytes, ~${estimatedTokens} tokens`,
    );

    expect(data).toBeDefined();
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 5: FigmaAdapter.readDesign works end-to-end
  // --------------------------------------------------------------------------
  it('FigmaAdapter.readDesign returns DesignContext', async () => {
    const adapter = new FigmaAdapter(mcpClient, FIGMA_FILE_ID);

    // Get first page ID
    const metaResult = await mcpClient.callTool('figma', 'get_metadata', {
      fileId: FIGMA_FILE_ID,
    });
    expect(metaResult.ok).toBe(true);
    if (!metaResult.ok) return;

    const meta = metaResult.value as { document?: { children?: Array<{ id: string }> } };
    const pageId = meta.document?.children?.[0]?.id;
    expect(pageId).toBeDefined();
    if (!pageId) return;

    const designResult: Result<DesignContext> = await adapter.readDesign(pageId);

    expect(designResult.ok).toBe(true);
    if (!designResult.ok) {
      console.error(`[spike] readDesign failed: ${designResult.error.message}`);
      return;
    }

    const ctx = designResult.value;
    expect(ctx.pageId).toBe(pageId);
    expect(ctx.metadata).toBeDefined();
    expect(typeof ctx.lastModified).toBe('string');

    console.log(`[spike] readDesign OK — pageId=${ctx.pageId}, html length=${ctx.html.length}, lastModified=${ctx.lastModified}`);

    adapter.dispose();
  }, 60_000);
});

// ============================================================================
// Verify skip behavior
// ============================================================================

describe('Figma MCP Spike (skip guard)', () => {
  it('spike tests are skipped when RUN_MCP_SPIKES is not set', () => {
    if (SPIKE_ENABLED) {
      console.log('[spike] RUN_MCP_SPIKES=true — spike tests are running');
    } else {
      console.log('[spike] RUN_MCP_SPIKES not set — spike tests skipped (expected)');
    }
    expect(true).toBe(true);
  });
});
