import { FigmaAdapter } from './figma-adapter.js';
import type { MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeMCPClient = (): MCPClient => ({
  callTool: jest.fn().mockResolvedValue(Ok({})),
  listTools: jest.fn().mockResolvedValue(Ok([])),
  isAvailable: jest.fn().mockResolvedValue(true),
});

// ============================================================================
// Tests
// ============================================================================

describe('FigmaAdapter', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createWorkspace', () => {
    it('calls generate_figma_design and returns fileId', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ fileId: 'new-file-123' }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.createWorkspace('MyProject');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('new-file-123');
      }
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'generate_figma_design', {
        projectName: 'MyProject',
        fileId: 'file-abc',
      });
    });

    it('returns error when MCP fails', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'fail', recoverable: true }),
      );
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.createWorkspace('MyProject');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('MCP unavailable');
      }
    });
  });

  describe('readDesign', () => {
    it('calls get_code and get_metadata', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        .mockResolvedValueOnce(Ok({ html: '<div>wireframe</div>' }))
        .mockResolvedValueOnce(Ok({ last_modified: '2026-01-01T00:00:00Z', name: 'Page 1' }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.readDesign('page-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.html).toBe('<div>wireframe</div>');
        expect(result.value.lastModified).toBe('2026-01-01T00:00:00Z');
        expect(result.value.pageId).toBe('page-1');
      }
    });

    it('returns error when get_code fails', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'fail', recoverable: true }),
      );
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.readDesign('page-1');

      expect(result.ok).toBe(false);
    });
  });

  describe('writeDesign', () => {
    it('calls generate_figma_design with spec', async () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.writeDesign({
        pageId: 'page-1',
        name: 'Test Page',
        html: '<div>design</div>',
      });

      expect(result.ok).toBe(true);
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'generate_figma_design', {
        fileId: 'file-abc',
        nodeId: 'page-1',
        name: 'Test Page',
        html: '<div>design</div>',
        tokens: undefined,
      });
    });
  });

  describe('getTokens', () => {
    it('returns design tokens from get_variables (Enterprise path)', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({
        colors: { primary: '#007AFF' },
        typography: { heading: { size: 24 } },
        spacing: { sm: '8px' },
      }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.getTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colors).toEqual({ primary: '#007AFF' });
      }
    });

    it('ADR-024: falls back to get_code when get_variables returns 403', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        // get_variables fails (403 Enterprise-only)
        .mockResolvedValueOnce(Err({ code: 'MCP_UNAVAILABLE', message: 'Figma API 403: Forbidden', recoverable: false }))
        // get_code fallback
        .mockResolvedValueOnce(Ok({ nodes: {} }))
        // get_metadata fallback
        .mockResolvedValueOnce(Ok({
          document: {
            children: [{
              name: 'Primary',
              fills: [{ type: 'SOLID', color: { r: 0, g: 0.478, b: 1, a: 1 } }],
              children: [],
            }],
          },
        }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.getTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colors).toHaveProperty('Primary');
      }
      // Verify fallback calls were made
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_variables', { fileId: 'file-abc' });
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_code', { fileId: 'file-abc' });
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_metadata', { fileId: 'file-abc' });
    });

    it('ADR-024: returns error when both get_variables and fallback fail', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        .mockResolvedValueOnce(Err({ code: 'MCP_UNAVAILABLE', message: '403', recoverable: false }))
        .mockResolvedValueOnce(Err({ code: 'MCP_UNAVAILABLE', message: 'get_code failed', recoverable: false }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.getTokens();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('fallback');
      }
    });
  });

  describe('lockForAgent / unlockForAgent', () => {
    it('allows locking and unlocking by the same agent', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const lockResult = adapter.lockForAgent('agent-1');
      expect(lockResult.ok).toBe(true);

      const unlockResult = adapter.unlockForAgent('agent-1');
      expect(unlockResult.ok).toBe(true);
    });

    it('prevents locking by a different agent', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.lockForAgent('agent-1');
      const lockResult = adapter.lockForAgent('agent-2');

      expect(lockResult.ok).toBe(false);
      if (!lockResult.ok) {
        expect(lockResult.error.message).toContain('agent-1');
      }
    });

    it('prevents unlocking by a different agent', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.lockForAgent('agent-1');
      const unlockResult = adapter.unlockForAgent('agent-2');

      expect(unlockResult.ok).toBe(false);
    });

    it('allows re-locking by the same agent', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.lockForAgent('agent-1');
      const lockResult = adapter.lockForAgent('agent-1');

      expect(lockResult.ok).toBe(true);
    });
  });

  describe('onUserEdit', () => {
    it('calls callback when last_modified changes', () => {
      jest.useFakeTimers();
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      let callCount = 0;
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ last_modified: '2026-01-01T00:00:00Z' }));

      adapter.onUserEdit(() => { callCount++; });

      // First poll — sets lastModified, no callback
      jest.advanceTimersByTime(30000);

      // Wait for the async callTool to resolve
      return Promise.resolve().then(() => {
        // Change last_modified for second poll
        (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ last_modified: '2026-01-01T00:01:00Z' }));
        jest.advanceTimersByTime(30000);

        return Promise.resolve().then(() => {
          expect(callCount).toBe(1);
          adapter.dispose();
        });
      });
    });
  });

  describe('dispose', () => {
    it('clears polling interval', () => {
      jest.useFakeTimers();
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.onUserEdit(() => {});
      adapter.dispose();

      // Advancing time should not trigger any more calls
      jest.advanceTimersByTime(60000);
      // Only the initial setInterval setup call, no actual polls after dispose
      expect(mcp.callTool).not.toHaveBeenCalled();
    });
  });
});
