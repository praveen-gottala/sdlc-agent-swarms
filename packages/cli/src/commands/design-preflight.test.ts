/**
 * @module design-preflight.test
 *
 * Tests for the shared design preflight helper.
 * Verifies that:
 * - Figma/Penpot setup instructions are shown on connection failure
 * - --mock returns a mock client on failure (no error exit)
 * - Successful connections return a real client
 * - process.exitCode is set to 1 on failure without --mock
 */

import {
  ensureDesignToolConnection,
  createMockMCPClient,
  FIGMA_SETUP_INSTRUCTIONS,
  PENPOT_SETUP_INSTRUCTIONS,
} from './design-preflight.js';

// ============================================================================
// Helpers
// ============================================================================

const createOutputStream = (): NodeJS.WritableStream & { output: string } => {
  let output = '';
  return {
    output,
    write(chunk: string | Uint8Array) {
      output += String(chunk);
      (this as { output: string }).output = output;
      return true;
    },
  } as NodeJS.WritableStream & { output: string };
};

// ============================================================================
// Mock setup — prevent real connections
// ============================================================================

// Mock agents-ux preflight functions to avoid real Docker/network calls
jest.mock('@agentforge/agents-ux', () => ({
  runFigmaPreflight: jest.fn().mockResolvedValue({
    ok: false,
    error: { code: 'MCP_UNAVAILABLE', message: 'Figma not connected (test)', recoverable: true },
  }),
  runPenpotPreflight: jest.fn().mockResolvedValue({
    ok: false,
    error: { code: 'MCP_UNAVAILABLE', message: 'Penpot not connected (test)', recoverable: true },
  }),
  loadPenpotSession: jest.fn().mockReturnValue({
    ok: false,
    error: { code: 'INVALID_STATE', message: 'no session', recoverable: false },
  }),
  PLUGIN_MANIFEST_REL: 'docker/talk-to-figma/figma-plugin/dist/manifest.json',
}));

// Mock core adapters to avoid real connection attempts
jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core') as Record<string, unknown>;
  return {
    ...actual,
    createFigmaAdapter: jest.fn().mockReturnValue({
      runPreflight: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'MCP_UNAVAILABLE', message: 'Figma adapter: not connected', recoverable: true },
      }),
      createMCPClient: jest.fn().mockReturnValue({
        client: { callTool: jest.fn(), listTools: jest.fn(), isAvailable: jest.fn() },
        disconnect: jest.fn(),
      }),
    }),
    createPenpotAdapter: jest.fn().mockReturnValue({
      createMCPClient: jest.fn().mockReturnValue({
        client: { callTool: jest.fn(), listTools: jest.fn(), isAvailable: jest.fn() },
        disconnect: jest.fn(),
      }),
    }),
  };
});

// ============================================================================
// Tests
// ============================================================================

describe('ensureDesignToolConnection', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  describe('Figma — connection failure without --mock', () => {
    it('shows Figma setup instructions', async () => {
      const out = createOutputStream();
      const result = await ensureDesignToolConnection('figma', out, {});

      expect(result).toBeNull();
      expect(out.output).toContain('Figma plugin not connected');
      expect(out.output).toContain('docker compose up -d figma-bridge');
      expect(out.output).toContain('Re-run this command');
    });

    it('sets process.exitCode to 1', async () => {
      const out = createOutputStream();
      await ensureDesignToolConnection('figma', out, {});

      expect(process.exitCode).toBe(1);
    });
  });

  describe('Penpot — connection failure without --mock', () => {
    it('shows Penpot setup instructions', async () => {
      const out = createOutputStream();
      const result = await ensureDesignToolConnection('penpot', out, {});

      expect(result).toBeNull();
      expect(out.output).toContain('Penpot MCP not connected');
      expect(out.output).toContain('docker compose up -d penpot-frontend penpot-mcp');
      expect(out.output).toContain('CONNECT TO MCP SERVER');
      expect(out.output).toContain('Re-run this command');
    });

    it('sets process.exitCode to 1', async () => {
      const out = createOutputStream();
      await ensureDesignToolConnection('penpot', out, {});

      expect(process.exitCode).toBe(1);
    });
  });

  describe('--mock flag', () => {
    it('returns mock client immediately with --mock (skips real connection)', async () => {
      const out = createOutputStream();
      const result = await ensureDesignToolConnection('figma', out, { mock: true });

      expect(result).not.toBeNull();
      expect(result!.mcpClient).toBeDefined();
      expect(out.output).toContain('mock MCP');
      expect(out.output).toContain('--mock');
      // Should NOT set exitCode
      expect(process.exitCode).toBeUndefined();
    });

    it('returns mock client immediately for Penpot with --mock', async () => {
      const out = createOutputStream();
      const result = await ensureDesignToolConnection('penpot', out, { mock: true });

      expect(result).not.toBeNull();
      expect(result!.mcpClient).toBeDefined();
      expect(out.output).toContain('mock MCP');
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('successful connection', () => {
    it('returns real client when Figma adapter connects', async () => {
      // Override the Figma adapter to simulate success
      const { createFigmaAdapter } = jest.requireMock('@agentforge/core') as {
        createFigmaAdapter: jest.Mock;
      };
      createFigmaAdapter.mockReturnValueOnce({
        runPreflight: jest.fn().mockResolvedValue({
          ok: true,
          value: {
            kind: 'figma',
            url: 'ws://localhost:3055',
            channel: 'test-channel',
            connectedAt: new Date().toISOString(),
            supportedTools: ['create_rectangle'],
          },
        }),
        createMCPClient: jest.fn().mockReturnValue({
          client: { callTool: jest.fn(), listTools: jest.fn(), isAvailable: jest.fn() },
          disconnect: jest.fn(),
        }),
      });

      const out = createOutputStream();
      const result = await ensureDesignToolConnection('figma', out, {});

      expect(result).not.toBeNull();
      expect(result!.mcpClient).toBeDefined();
      expect(result!.disconnectFn).toBeDefined();
      expect(process.exitCode).toBeUndefined();
    });
  });
});

describe('createMockMCPClient', () => {
  it('returns an MCPClient that resolves all calls', async () => {
    const client = createMockMCPClient();

    const callResult = await client.callTool('server', 'tool', {});
    expect(callResult).toEqual({ ok: true, value: {} });

    const listResult = await client.listTools('server');
    expect(listResult).toEqual({ ok: true, value: [] });

    const available = await client.isAvailable('server');
    expect(available).toBe(true);
  });
});

describe('Setup instruction constants', () => {
  it('FIGMA_SETUP_INSTRUCTIONS contains key steps', () => {
    expect(FIGMA_SETUP_INSTRUCTIONS).toContain('docker compose up -d figma-bridge');
    expect(FIGMA_SETUP_INSTRUCTIONS).toContain('manifest.json');
    expect(FIGMA_SETUP_INSTRUCTIONS).toContain('Connect');
  });

  it('PENPOT_SETUP_INSTRUCTIONS contains key steps', () => {
    expect(PENPOT_SETUP_INSTRUCTIONS).toContain('docker compose up -d penpot-frontend penpot-mcp');
    expect(PENPOT_SETUP_INSTRUCTIONS).toContain('localhost:9001');
    expect(PENPOT_SETUP_INSTRUCTIONS).toContain('CONNECT TO MCP SERVER');
  });
});
