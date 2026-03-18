/**
 * P25 — Figma MCP Bidirectional Integration (Wave 4)
 *
 * Validates the Figma MCP integration for the design phase:
 * Read path, write path, Code Connect, user edit detection,
 * DesignSurface interface completeness, and fallback behavior.
 *
 * Tests use mocked MCP transport (Figma MCP not configured in test env).
 * NOTE: All tests use mocked CI responses.
 */

import { FigmaAdapter } from './figma-adapter.js';
import type { DesignSpec, DesignTokens } from '../design-surface.js';
import type { MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Test Helpers
// ============================================================================

const makeMCPClient = (): MCPClient => ({
  callTool: jest.fn().mockResolvedValue(Ok({})),
  listTools: jest.fn().mockResolvedValue(Ok([])),
  isAvailable: jest.fn().mockResolvedValue(true),
});

// ============================================================================
// P25.1 — Read path: get_code extracts design context
// ============================================================================

describe('P25 — Figma MCP Bidirectional Integration', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('P25.1 — read path: get_code extracts design context', () => {
    it('extracts component structure, layout, and tokens via get_code', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        .mockResolvedValueOnce(Ok({
          html: '<div class="flex gap-4"><button class="btn-primary">Login</button></div>',
        }))
        .mockResolvedValueOnce(Ok({
          last_modified: '2026-03-15T10:00:00Z',
          name: 'Login Page',
          type: 'FRAME',
          children: 3,
        }));

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.readDesign('page-login');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.pageId).toBe('page-login');
        expect(result.value.html).toContain('btn-primary');
        expect(result.value.html).toContain('Login');
        expect(result.value.lastModified).toBe('2026-03-15T10:00:00Z');
        expect(result.value.metadata).toEqual(expect.objectContaining({
          name: 'Login Page',
          type: 'FRAME',
        }));
      }
    });

    it('calls both get_code and get_metadata for full context', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        .mockResolvedValueOnce(Ok({ html: '<div>design</div>' }))
        .mockResolvedValueOnce(Ok({ last_modified: '2026-01-01T00:00:00Z' }));

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      await adapter.readDesign('page-1');

      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_code', {
        fileId: 'file-abc',
        nodeId: 'page-1',
      });
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_metadata', {
        fileId: 'file-abc',
        nodeId: 'page-1',
      });
    });

    it('returns error when get_code fails', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Figma down', recoverable: true }),
      );

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.readDesign('page-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('MCP unavailable');
      }
    });
  });

  // ============================================================================
  // P25.2 — Write path: generate_figma_design creates editable layers
  // ============================================================================

  describe('P25.2 — write path: generate_figma_design', () => {
    it('creates editable Figma layers with auto-layout via writeDesign', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ success: true, layerId: 'layer-123' }));

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const spec: DesignSpec = {
        pageId: 'page-login',
        name: 'Login Page',
        html: '<div class="flex flex-col gap-4"><input type="email" /><button>Submit</button></div>',
        tokens: {
          colors: { primary: '#007AFF', background: '#FFFFFF' },
          typography: { body: { size: 16, weight: 400 } },
          spacing: { sm: '8px', md: '16px', lg: '24px' },
        },
      };

      const result = await adapter.writeDesign(spec);

      expect(result.ok).toBe(true);
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'generate_figma_design', {
        fileId: 'file-abc',
        nodeId: 'page-login',
        name: 'Login Page',
        html: spec.html,
        tokens: spec.tokens,
      });
    });

    it('passes tokens to Figma for consistent design system application', async () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const tokens: DesignTokens = {
        colors: { primary: '#007AFF', error: '#FF3B30' },
        typography: { heading: { size: 24, weight: 700 }, body: { size: 16, weight: 400 } },
        spacing: { sm: '8px', md: '16px' },
      };

      await adapter.writeDesign({
        pageId: 'page-1',
        name: 'Test',
        html: '<div>test</div>',
        tokens,
      });

      const callArgs = (mcp.callTool as jest.Mock).mock.calls[0];
      expect(callArgs[2].tokens).toEqual(tokens);
    });

    it('returns error when generate_figma_design fails', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Write failed', recoverable: true }),
      );

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.writeDesign({
        pageId: 'page-1',
        name: 'Test',
        html: '<div>test</div>',
      });

      expect(result.ok).toBe(false);
    });
  });

  // ============================================================================
  // P25.3 — Code Connect: Figma component IDs map to codebase paths
  // ============================================================================

  describe('P25.3 — Code Connect mapping', () => {
    it('Figma node IDs are passed as component identifiers in readDesign', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock)
        .mockResolvedValueOnce(Ok({ html: '<button class="btn-primary">Click</button>' }))
        .mockResolvedValueOnce(Ok({
          last_modified: '2026-01-01T00:00:00Z',
          componentId: 'btn-primary-001',
          name: 'Button/Primary/Large',
        }));

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.readDesign('btn-primary-001');

      expect(result.ok).toBe(true);
      if (result.ok) {
        // The pageId maps to the Figma node ID used in Code Connect
        expect(result.value.pageId).toBe('btn-primary-001');
        // Metadata contains component mapping info
        expect(result.value.metadata).toEqual(expect.objectContaining({
          componentId: 'btn-primary-001',
          name: 'Button/Primary/Large',
        }));
      }
    });

    // DEVIATION: Code Connect bidirectional mapping (Figma component ID → codebase file path)
    // is not yet implemented. Visual Designer outputs componentMappings in its response
    // but no automated resolution from Figma IDs to code paths exists yet.
    it('DEVIATION: Code Connect resolution not implemented — componentMappings are output-only', () => {
      // The visual designer agent outputs componentMappings like:
      // { wireframeElement: "cta-button", designComponent: "Button/Primary/Large" }
      // But no automated Figma ID → code path resolution exists.
      // This is acceptable for Phase 1 — manual mapping in agentforge.yaml is the workaround.
      expect(true).toBe(true); // Placeholder acknowledging deviation
    });
  });

  // ============================================================================
  // P25.4 — Design change detection via onUserEdit()
  // ============================================================================

  describe('P25.4 — human edit detection via onUserEdit', () => {
    it('detects when a human edits in Figma via polling last_modified', () => {
      jest.useFakeTimers();
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const changes: Array<{ field: string; previousValue: unknown; newValue: unknown }> = [];

      // First poll sets initial state
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ last_modified: '2026-03-15T10:00:00Z' }));
      adapter.onUserEdit((change) => {
        changes.push({
          field: change.field,
          previousValue: change.previousValue,
          newValue: change.newValue,
        });
      });

      jest.advanceTimersByTime(30000);

      return Promise.resolve().then(() => {
        // Human edits the Figma file — last_modified changes
        (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ last_modified: '2026-03-15T10:05:00Z' }));
        jest.advanceTimersByTime(30000);

        return Promise.resolve().then(() => {
          expect(changes).toHaveLength(1);
          expect(changes[0].field).toBe('last_modified');
          expect(changes[0].previousValue).toBe('2026-03-15T10:00:00Z');
          expect(changes[0].newValue).toBe('2026-03-15T10:05:00Z');
          adapter.dispose();
        });
      });
    });

    it('does not trigger callback when last_modified is unchanged', () => {
      jest.useFakeTimers();
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      let callbackCount = 0;
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ last_modified: '2026-03-15T10:00:00Z' }));
      adapter.onUserEdit(() => { callbackCount++; });

      // Multiple polls with same timestamp
      jest.advanceTimersByTime(30000);

      return Promise.resolve().then(() => {
        jest.advanceTimersByTime(30000);
        return Promise.resolve().then(() => {
          jest.advanceTimersByTime(30000);
          return Promise.resolve().then(() => {
            expect(callbackCount).toBe(0);
            adapter.dispose();
          });
        });
      });
    });
  });

  // ============================================================================
  // P25.5 — DesignSurface interface fully implemented
  // ============================================================================

  describe('P25.5 — DesignSurface interface completeness', () => {
    it('FigmaAdapter implements all DesignSurface methods', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      // Verify all DesignSurface methods exist
      expect(typeof adapter.createWorkspace).toBe('function');
      expect(typeof adapter.readDesign).toBe('function');
      expect(typeof adapter.writeDesign).toBe('function');
      expect(typeof adapter.getTokens).toBe('function');
      expect(typeof adapter.onUserEdit).toBe('function');
      expect(typeof adapter.lockForAgent).toBe('function');
      expect(typeof adapter.unlockForAgent).toBe('function');
    });

    it('createWorkspace creates a new design file linked to project', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({ fileId: 'new-file-xyz' }));
      const adapter = new FigmaAdapter(mcp, 'file-template');

      const result = await adapter.createWorkspace('TestApp');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('new-file-xyz');
      }
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'generate_figma_design', {
        projectName: 'TestApp',
        fileId: 'file-template',
      });
    });

    it('getTokens extracts colors, typography, and spacing', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({
        colors: { primary: '#007AFF', secondary: '#5856D6' },
        typography: { heading: { size: 24 }, body: { size: 16 } },
        spacing: { sm: '8px', md: '16px', lg: '24px' },
      }));
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      const result = await adapter.getTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colors).toEqual({ primary: '#007AFF', secondary: '#5856D6' });
        expect(result.value.typography).toEqual({ heading: { size: 24 }, body: { size: 16 } });
        expect(result.value.spacing).toEqual({ sm: '8px', md: '16px', lg: '24px' });
      }
      expect(mcp.callTool).toHaveBeenCalledWith('figma', 'get_variables', {
        fileId: 'file-abc',
      });
    });

    it('lockForAgent prevents concurrent agent modifications', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      // Agent 1 locks
      const lock1 = adapter.lockForAgent('wireframe_generator');
      expect(lock1.ok).toBe(true);

      // Agent 2 cannot lock
      const lock2 = adapter.lockForAgent('visual_designer');
      expect(lock2.ok).toBe(false);
      if (!lock2.ok) {
        expect(lock2.error.code).toBe('SPEC_LOCK_FAILED');
        expect(lock2.error.message).toContain('wireframe_generator');
      }

      // Agent 1 unlocks
      const unlock = adapter.unlockForAgent('wireframe_generator');
      expect(unlock.ok).toBe(true);

      // Now agent 2 can lock
      const lock3 = adapter.lockForAgent('visual_designer');
      expect(lock3.ok).toBe(true);
    });

    it('lockForAgent allows re-locking by same agent (idempotent)', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.lockForAgent('agent-1');
      const result = adapter.lockForAgent('agent-1');
      expect(result.ok).toBe(true);
    });

    it('unlockForAgent rejects unlock by different agent', () => {
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.lockForAgent('agent-1');
      const result = adapter.unlockForAgent('agent-2');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('SPEC_LOCK_FAILED');
      }
    });
  });

  // ============================================================================
  // P25.6 — Fallback when Figma MCP unavailable (F7)
  // ============================================================================

  describe('P25.6 — Figma unavailable fallback to Storybook', () => {
    it('readDesign returns MCP_UNAVAILABLE when Figma is down', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Figma MCP not responding', recoverable: true }),
      );

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.readDesign('page-1');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('MCP unavailable');
      }
    });

    it('writeDesign returns MCP_UNAVAILABLE when Figma is down', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Figma down', recoverable: true }),
      );

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.writeDesign({
        pageId: 'page-1',
        name: 'Test',
        html: '<div>test</div>',
      });

      expect(result.ok).toBe(false);
    });

    it('createWorkspace returns MCP_UNAVAILABLE when Figma is down', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'Figma down', recoverable: true }),
      );

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.createWorkspace('TestApp');

      expect(result.ok).toBe(false);
    });

    // DEVIATION: Storybook fallback adapter is not yet implemented.
    // PRD specifies F7: "Retry 3x, fall back to code-first design (Storybook), notify human"
    // Phase 1 only supports Figma adapter. Storybook adapter is Phase 2 scope.
    it('DEVIATION: Storybook fallback adapter not yet implemented (Phase 1 scope)', () => {
      // The DesignSurface interface supports multiple adapters but only FigmaAdapter exists.
      // When Figma is unavailable, the error propagates to the caller who must handle fallback.
      // A StorybookAdapter implementing DesignSurface would be the Phase 2 implementation.
      expect(true).toBe(true); // Documented deviation
    });

    it('getTokens returns empty defaults when Figma returns partial data', async () => {
      const mcp = makeMCPClient();
      (mcp.callTool as jest.Mock).mockResolvedValue(Ok({
        colors: { primary: '#007AFF' },
        // typography and spacing missing
      }));

      const adapter = new FigmaAdapter(mcp, 'file-abc');
      const result = await adapter.getTokens();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.colors).toEqual({ primary: '#007AFF' });
        expect(result.value.typography).toEqual({}); // Empty default
        expect(result.value.spacing).toEqual({}); // Empty default
      }
    });
  });

  // ============================================================================
  // P25 — dispose cleanup
  // ============================================================================

  describe('P25 — dispose cleanup', () => {
    it('dispose stops polling interval', () => {
      jest.useFakeTimers();
      const mcp = makeMCPClient();
      const adapter = new FigmaAdapter(mcp, 'file-abc');

      adapter.onUserEdit(() => {});
      adapter.dispose();

      jest.advanceTimersByTime(60000);
      expect(mcp.callTool).not.toHaveBeenCalled();
    });
  });
});
