/**
 * @module penpot-collaboration.test
 *
 * Unit tests for the Penpot collaboration session and review callback.
 * Verifies:
 * - Penpot → Figma output mapping
 * - applyFeedback generates and executes code via execute_code
 * - Review callback captures screenshot and evaluates
 */

import { Ok, Err } from '@agentforge/core';
import {
  createPenpotCollaborationSession,
  createPenpotReviewCallback,
  mapPenpotToDesignOutput,
} from './penpot-collaboration.js';
import type { PenpotDesignOutput } from './ux-penpot-design.js';
import type { DesignSystemContext } from './design-collaboration.js';

// ============================================================================
// Fixtures
// ============================================================================

const MOCK_PENPOT_DESIGN: PenpotDesignOutput = {
  penpotProjectId: 'proj-123',
  penpotPageId: 'page-456',
  penpotNodeIds: { Header: 'node-1', Sidebar: 'node-2' },
  moduleId: 'home',
  breakpoints: ['1280', '768'],
  script: 'const board = penpot.createBoard(); return { rootId: board.id };',
};

const MOCK_DS_CONTEXT: DesignSystemContext = {
  designSystemPrompt: '# Test Design System\n- primary: blue\n',
  colorPalette: [],
  shadeScales: {},
  componentTree: [],
  tokenBindings: {},
  typographyScale: [],
  spacingScale: [],
};

const createMockProvider = (response: string) => ({
  complete: jest.fn().mockResolvedValue(
    Ok({ content: response }),
  ),
});

const createMockMCPClient = (callToolResponse?: Record<string, unknown>) => ({
  callTool: jest.fn().mockResolvedValue(
    Ok(callToolResponse ?? { content: [{ text: '{"result":{"nodeIds":{}}}' }] }),
  ),
  listTools: jest.fn().mockResolvedValue(Ok([])),
  isAvailable: jest.fn().mockResolvedValue(true),
});

// ============================================================================
// Tests
// ============================================================================

describe('mapPenpotToDesignOutput', () => {
  it('maps Penpot fields to Figma field names', () => {
    const result = mapPenpotToDesignOutput(MOCK_PENPOT_DESIGN);

    expect(result.figmaFileId).toBe('proj-123');
    expect(result.figmaPageId).toBe('page-456');
    expect(result.figmaNodeIds).toEqual({ Header: 'node-1', Sidebar: 'node-2' });
    expect(result.moduleId).toBe('home');
    expect(result.breakpoints).toEqual(['1280', '768']);
  });

  it('preserves screenshot data', () => {
    const withScreenshot: PenpotDesignOutput = {
      ...MOCK_PENPOT_DESIGN,
      screenshotPath: 'screenshots/penpot/root.png',
      componentSnapshots: [{ nodeId: 'node-1', name: 'Header' }],
    };

    const result = mapPenpotToDesignOutput(withScreenshot);
    expect(result.screenshotPath).toBe('screenshots/penpot/root.png');
    expect(result.componentSnapshots).toHaveLength(1);
  });
});

describe('createPenpotCollaborationSession', () => {
  it('applyFeedback calls LLM and execute_code', async () => {
    const provider = createMockProvider('```json\n{"code": "const h = findByName(penpot.currentPage.root, \'Header\'); h.resize(800, 100);"}\n```');
    const mcpClient = createMockMCPClient();

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider,
      MOCK_PENPOT_DESIGN,
      MOCK_DS_CONTEXT,
      'API docs here',
    );

    const result = await session.applyFeedback('Make the header wider');

    expect(result.ok).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(mcpClient.callTool).toHaveBeenCalledWith(
      'penpot',
      'execute_code',
      expect.objectContaining({ code: expect.stringContaining('findByName') }),
    );
  });

  it('records changes in history', async () => {
    const provider = createMockProvider('```json\n{"code": "return { nodeIds: {} };"}\n```');
    const mcpClient = createMockMCPClient();

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider,
      MOCK_PENPOT_DESIGN,
      MOCK_DS_CONTEXT,
      '',
    );

    await session.applyFeedback('Change colors');

    const history = session.getChangeHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history.some(h => h.field === 'feedback')).toBe(true);
  });

  it('returns error when LLM fails', async () => {
    const provider = {
      complete: jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'rate limited', recoverable: true }),
      ),
    };
    const mcpClient = createMockMCPClient();

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider,
      MOCK_PENPOT_DESIGN,
      MOCK_DS_CONTEXT,
      '',
    );

    const result = await session.applyFeedback('anything');
    expect(result.ok).toBe(false);
  });

  it('returns error when execute_code fails', async () => {
    const provider = createMockProvider('```json\n{"code": "doSomething();"}\n```');
    const mcpClient = {
      ...createMockMCPClient(),
      callTool: jest.fn().mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'disconnected', recoverable: true }),
      ),
    };

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider,
      MOCK_PENPOT_DESIGN,
      MOCK_DS_CONTEXT,
      '',
    );

    const result = await session.applyFeedback('change something');
    expect(result.ok).toBe(false);
  });

  it('startWatching and stopWatching are no-ops', () => {
    const provider = createMockProvider('');
    const mcpClient = createMockMCPClient();

    const session = createPenpotCollaborationSession(
      mcpClient,
      provider,
      MOCK_PENPOT_DESIGN,
      MOCK_DS_CONTEXT,
      '',
    );

    // Should not throw
    session.startWatching();
    session.stopWatching();
  });
});

describe('createPenpotReviewCallback', () => {
  it('captures screenshot via export_shape and evaluates', async () => {
    const screenshotBase64 = 'iVBORw0KGgoAAAANSUhEUg=='; // minimal PNG header
    const mcpClient = {
      callTool: jest.fn().mockResolvedValue(
        Ok({ content: [{ type: 'image', data: screenshotBase64, mimeType: 'image/png' }] }),
      ),
      listTools: jest.fn().mockResolvedValue(Ok([])),
      isAvailable: jest.fn().mockResolvedValue(true),
    };

    // Mock evaluateDesign via provider — it will be called by the review callback
    const provider = {
      complete: jest.fn().mockResolvedValue(
        Ok({
          content: JSON.stringify({
            score: 85,
            overallQuality: 'good',
            issues: [],
          }),
        }),
      ),
    };

    const reviewFn = createPenpotReviewCallback(
      provider,
      '{"moduleId":"home"}',
      mcpClient,
      'node-1',
    );

    const design = mapPenpotToDesignOutput(MOCK_PENPOT_DESIGN);
    await reviewFn(design);

    // Verify export_shape was called with the root shape ID
    expect(mcpClient.callTool).toHaveBeenCalledWith(
      'penpot',
      'export_shape',
      { shapeId: 'node-1', format: 'png' },
    );
  });

  it('returns error when no shapes to review', async () => {
    const mcpClient = createMockMCPClient();
    const provider = createMockProvider('');

    const reviewFn = createPenpotReviewCallback(
      provider,
      '{}',
      mcpClient,
      '', // empty root shape
    );

    const emptyDesign = mapPenpotToDesignOutput({
      ...MOCK_PENPOT_DESIGN,
      penpotNodeIds: {},
    });

    const result = await reviewFn(emptyDesign);
    expect(result.ok).toBe(false);
  });

  it('returns error when screenshot fails', async () => {
    const mcpClient = {
      callTool: jest.fn().mockResolvedValue(
        Err({ code: 'MCP_UNAVAILABLE', message: 'export failed', recoverable: true }),
      ),
      listTools: jest.fn().mockResolvedValue(Ok([])),
      isAvailable: jest.fn().mockResolvedValue(true),
    };
    const provider = createMockProvider('');

    const reviewFn = createPenpotReviewCallback(
      provider,
      '{}',
      mcpClient,
      'node-1',
    );

    const design = mapPenpotToDesignOutput(MOCK_PENPOT_DESIGN);
    const result = await reviewFn(design);
    expect(result.ok).toBe(false);
  });
});
