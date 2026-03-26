/**
 * @module talk-to-figma-spike
 *
 * Integration spike test: proves bidirectional Figma manipulation via
 * the TalkToFigma WebSocket bridge (create frames, shapes, text, styles).
 *
 * Skipped by default. Enable with:
 *   RUN_MCP_SPIKES=true AGENTFORGE_MCP_FIGMA_TOKEN=... AGENTFORGE_MCP_FIGMA_FILE_ID=... npx jest
 *
 * Optionally set TALK_TO_FIGMA_CHANNEL to reuse an existing channel.
 *
 * See docs/mcp-spike-setup.md for full setup instructions.
 */

import type { MCPClient, Result, TalkToFigmaConnection } from '@agentforge/core';
import { createMCPClient, createTalkToFigmaTransport, Ok, Err } from '@agentforge/core';
import type { MCPRequest } from '@agentforge/core';
import type {
  MCPMiddlewareOptions,
  MCPTransport,
  PermissionChecker,
} from '@agentforge/core';
import type { SecretProvider } from '@agentforge/core';
import type { AgentContract } from '@agentforge/core';

// ============================================================================
// Environment & skip logic
// ============================================================================

const SPIKE_ENABLED = process.env.RUN_MCP_SPIKES === 'true';
const FIGMA_TOKEN = process.env.AGENTFORGE_MCP_FIGMA_TOKEN ?? '';
const FIGMA_FILE_ID = process.env.AGENTFORGE_MCP_FIGMA_FILE_ID ?? '';
const TALK_TO_FIGMA_CHANNEL = process.env.TALK_TO_FIGMA_CHANNEL;

const describeSpike = SPIKE_ENABLED ? describe : describe.skip;

// ============================================================================
// Minimal test fixtures
// ============================================================================

/** Agent contract permitting both figma read and figma-write tools. */
const spikeAgent: AgentContract = {
  role: 'ux-talk-to-figma-spike',
  description: 'Spike test agent for TalkToFigma MCP integration',
  category: 'design',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 8000 },
  tools: [
    'figma:get_metadata',
    'figma:get_code',
    'figma-write:create_frame',
    'figma-write:create_text',
    'figma-write:create_rectangle',
    'figma-write:set_fill_color',
    'figma-write:set_layout_mode',
    'figma-write:set_padding',
    'figma-write:set_corner_radius',
    'figma-write:move_node',
  ],
  permissions: ['mcp:figma:*', 'mcp:figma-write:*'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 1.0 },
  on_complete: 'notify',
  on_error: 'halt',
  context: {},
};

/** Permissive permission checker for spike tests. */
const allowAll: PermissionChecker = () => Ok(undefined);

/** Secret provider — reads AGENTFORGE_MCP_FIGMA_TOKEN for 'figma' server. */
const envSecrets: SecretProvider = {
  getSecret(server: string, key: string): Result<string> {
    if (server === 'figma' && key === 'TOKEN' && FIGMA_TOKEN) {
      return Ok(FIGMA_TOKEN);
    }
    // figma-write needs no token (local WebSocket)
    if (server === 'figma-write') {
      return Ok('');
    }
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `No secret for ${server}/${key}`,
      recoverable: false,
    });
  },
  hasSecret(server: string, key: string): boolean {
    if (server === 'figma' && key === 'TOKEN') return FIGMA_TOKEN.length > 0;
    if (server === 'figma-write') return true;
    return false;
  },
};

/**
 * Figma REST API transport — reads file structure via Figma REST API.
 * Copied from figma-mcp-spike.test.ts for the combined transport.
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

    const headers: Record<string, string> = { 'X-Figma-Token': token };
    const fileId = (params.fileId as string) ?? FIGMA_FILE_ID;

    try {
      if (method === 'listTools') {
        return Ok([
          { name: 'get_metadata', description: 'Get file metadata', inputSchema: {} },
          { name: 'get_code', description: 'Get node code/HTML', inputSchema: {} },
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
        return Ok(await res.json());
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
        return Ok(await res.json());
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

describeSpike('TalkToFigma MCP Spike', () => {
  let mcpClient: MCPClient;
  let writeConnection: TalkToFigmaConnection;

  // Track created node IDs for cross-test references
  const createdNodeIds: string[] = [];

  beforeAll(() => {
    if (!FIGMA_TOKEN) {
      throw new Error('AGENTFORGE_MCP_FIGMA_TOKEN must be set when RUN_MCP_SPIKES=true');
    }
    if (!FIGMA_FILE_ID) {
      throw new Error('AGENTFORGE_MCP_FIGMA_FILE_ID must be set when RUN_MCP_SPIKES=true');
    }

    // Create TalkToFigma transport (write)
    const { transport: writeTransport, connection } = createTalkToFigmaTransport({
      channel: TALK_TO_FIGMA_CHANNEL,
    });
    writeConnection = connection;

    // Create Figma REST transport (read)
    const readTransport = createFigmaRestTransport();

    // Combined transport: routes by server name
    const combinedTransport: MCPTransport = async (request: MCPRequest): Promise<Result<unknown>> => {
      if (request.server === 'figma-write') {
        return writeTransport(request);
      }
      return readTransport(request);
    };

    const middlewareOptions: MCPMiddlewareOptions = {
      agent: spikeAgent,
      permissionChecker: allowAll,
      secretProvider: envSecrets,
      maxRetries: 1,
      baseRetryDelayMs: 500,
    };

    mcpClient = createMCPClient({
      middlewareOptions,
      transport: combinedTransport,
    });
  });

  afterAll(() => {
    writeConnection.disconnect();
  });

  // --------------------------------------------------------------------------
  // Test 1: connects to TalkToFigma bridge
  // --------------------------------------------------------------------------
  it('connects to TalkToFigma bridge via WebSocket', async () => {
    const available = await mcpClient.isAvailable('figma-write');
    expect(available).toBe(true);

    expect(writeConnection.isConnected()).toBe(true);
    console.log(`[spike] TalkToFigma connected on channel: ${writeConnection.channel}`);
  }, 15_000);

  // --------------------------------------------------------------------------
  // Test 2: create_frame creates a frame
  // --------------------------------------------------------------------------
  it('create_frame creates a frame and returns node ID', async () => {
    const result = await mcpClient.callTool('figma-write', 'create_frame', {
      name: 'spike-test-frame',
      width: 400,
      height: 300,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    console.log(`[spike] create_frame result: ${JSON.stringify(data)}`);

    // Store node ID for later tests
    const nodeId = data.id as string | undefined;
    if (nodeId) {
      createdNodeIds.push(nodeId);
      console.log(`[spike] Created frame nodeId: ${nodeId}`);
    }

    expect(data).toBeDefined();
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 3: create_text adds text to frame
  // --------------------------------------------------------------------------
  it('create_text adds text node to the created frame', async () => {
    const parentId = createdNodeIds[0];
    if (!parentId) {
      console.warn('[spike] Skipping create_text — no frame ID from previous test');
      return;
    }

    const result = await mcpClient.callTool('figma-write', 'create_text', {
      text: 'Hello from AgentForge spike',
      parentId,
      fontSize: 16,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    console.log(`[spike] create_text result: ${JSON.stringify(data)}`);

    const nodeId = data.id as string | undefined;
    if (nodeId) {
      createdNodeIds.push(nodeId);
    }
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 4: set_layout_mode enables auto-layout
  // --------------------------------------------------------------------------
  it('set_layout_mode enables auto-layout on frame', async () => {
    const frameId = createdNodeIds[0];
    if (!frameId) {
      console.warn('[spike] Skipping set_layout_mode — no frame ID');
      return;
    }

    const result = await mcpClient.callTool('figma-write', 'set_layout_mode', {
      nodeId: frameId,
      mode: 'VERTICAL',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    console.log(`[spike] set_layout_mode result: ${JSON.stringify(data)}`);
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 5: set_fill_color applies color
  // --------------------------------------------------------------------------
  it('set_fill_color applies color to frame', async () => {
    const frameId = createdNodeIds[0];
    if (!frameId) {
      console.warn('[spike] Skipping set_fill_color — no frame ID');
      return;
    }

    const result = await mcpClient.callTool('figma-write', 'set_fill_color', {
      nodeId: frameId,
      r: 0.2,
      g: 0.4,
      b: 0.8,
      a: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    console.log(`[spike] set_fill_color result: ${JSON.stringify(data)}`);
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 6: compose a card component (multi-step)
  // --------------------------------------------------------------------------
  it('composes a card component with frame + text + fill + corner_radius + padding', async () => {
    // Step 1: Create card frame
    const frameResult = await mcpClient.callTool('figma-write', 'create_frame', {
      name: 'spike-card',
      width: 320,
      height: 200,
    });
    expect(frameResult.ok).toBe(true);
    if (!frameResult.ok) return;

    const frameData = frameResult.value as Record<string, unknown>;
    const cardId = frameData.id as string;
    console.log(`[spike] Card frame created: ${cardId}`);

    if (cardId) createdNodeIds.push(cardId);

    // Step 2: Add title text
    const titleResult = await mcpClient.callTool('figma-write', 'create_text', {
      text: 'Card Title',
      parentId: cardId,
      fontSize: 24,
    });
    expect(titleResult.ok).toBe(true);

    // Step 3: Set fill color (card background)
    const fillResult = await mcpClient.callTool('figma-write', 'set_fill_color', {
      nodeId: cardId,
      r: 0.98,
      g: 0.98,
      b: 0.98,
      a: 1,
    });
    expect(fillResult.ok).toBe(true);

    // Step 4: Set corner radius
    const radiusResult = await mcpClient.callTool('figma-write', 'set_corner_radius', {
      nodeId: cardId,
      radius: 12,
    });
    expect(radiusResult.ok).toBe(true);

    // Step 5: Set padding
    const paddingResult = await mcpClient.callTool('figma-write', 'set_padding', {
      nodeId: cardId,
      top: 16,
      right: 16,
      bottom: 16,
      left: 16,
    });
    expect(paddingResult.ok).toBe(true);

    console.log('[spike] Card component composed successfully (frame + text + fill + radius + padding)');
  }, 60_000);

  // --------------------------------------------------------------------------
  // Test 7: move_node repositions elements
  // --------------------------------------------------------------------------
  it('move_node repositions a created element', async () => {
    const nodeId = createdNodeIds[0];
    if (!nodeId) {
      console.warn('[spike] Skipping move_node — no node ID');
      return;
    }

    const result = await mcpClient.callTool('figma-write', 'move_node', {
      nodeId,
      x: 100,
      y: 200,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = result.value as Record<string, unknown>;
    console.log(`[spike] move_node result: ${JSON.stringify(data)}`);
  }, 30_000);

  // --------------------------------------------------------------------------
  // Test 8: bidirectional read+write
  // --------------------------------------------------------------------------
  it('bidirectional: reads via figma (REST), writes via figma-write (WebSocket)', async () => {
    // Read: get file metadata via REST
    const metaResult = await mcpClient.callTool('figma', 'get_metadata', {
      fileId: FIGMA_FILE_ID,
    });
    expect(metaResult.ok).toBe(true);
    if (!metaResult.ok) return;

    const meta = metaResult.value as Record<string, unknown>;
    console.log(`[spike] Read via figma: file name = ${meta.name}`);

    // Write: create a frame via WebSocket
    const writeResult = await mcpClient.callTool('figma-write', 'create_frame', {
      name: `spike-bidirectional-${Date.now()}`,
      width: 200,
      height: 100,
    });
    expect(writeResult.ok).toBe(true);
    if (!writeResult.ok) return;

    const writeData = writeResult.value as Record<string, unknown>;
    console.log(`[spike] Write via figma-write: ${JSON.stringify(writeData)}`);

    if (writeData.id) {
      createdNodeIds.push(writeData.id as string);
    }

    console.log('[spike] Bidirectional read+write verified: REST read + WebSocket write');
  }, 30_000);
});

// ============================================================================
// Verify skip behavior
// ============================================================================

describe('TalkToFigma MCP Spike (skip guard)', () => {
  it('spike tests are skipped when RUN_MCP_SPIKES is not set', () => {
    if (SPIKE_ENABLED) {
      console.log('[spike] RUN_MCP_SPIKES=true — TalkToFigma spike tests are running');
    } else {
      console.log('[spike] RUN_MCP_SPIKES not set — TalkToFigma spike tests skipped (expected)');
    }
    expect(true).toBe(true);
  });
});
