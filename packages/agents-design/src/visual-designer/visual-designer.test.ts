import { createVisualDesignerWork, VISUAL_DESIGNER_CONTRACT } from './visual-designer.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSurface } from '../design-surface.js';

// ============================================================================
// Helpers
// ============================================================================

const VISUAL_OUTPUT = JSON.stringify({
  name: 'Dashboard Visual Design',
  html: '<div class="page" style="color: #333">Styled content</div>',
  appliedTokens: {
    colors: ['primary-500', 'neutral-100'],
    typography: ['heading-xl'],
    spacing: ['space-4'],
  },
});

const makeProvider = (output: string = VISUAL_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeDesignSurface = (): DesignSurface => ({
  createWorkspace: jest.fn().mockResolvedValue(Ok('workspace-1')),
  readDesign: jest.fn().mockResolvedValue(Ok({
    pageId: 'page-1',
    html: '<div>wireframe</div>',
    metadata: {},
    lastModified: '2026-01-01T00:00:00Z',
  })),
  writeDesign: jest.fn().mockResolvedValue(Ok(undefined)),
  getTokens: jest.fn().mockResolvedValue(Ok({
    colors: { primary: '#007AFF', neutral: '#F5F5F5' },
    typography: { heading: { size: 24, weight: 700 } },
    spacing: { sm: '8px', md: '16px' },
  })),
  onUserEdit: jest.fn(),
  lockForAgent: jest.fn().mockReturnValue(Ok(undefined)),
  unlockForAgent: jest.fn().mockReturnValue(Ok(undefined)),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockResolvedValue(Ok({})),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

// ============================================================================
// Tests
// ============================================================================

describe('createVisualDesignerWork', () => {
  it('reads wireframe design and tokens, then writes visual design', async () => {
    const surface = makeDesignSurface();
    const workFn = createVisualDesignerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/wireframe' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.designRef).toBe('designs/page-1/visual');
      expect(result.value.tokensApplied).toBeGreaterThan(0);
    }
  });

  it('calls readDesign and getTokens', async () => {
    const surface = makeDesignSurface();
    const workFn = createVisualDesignerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/wireframe' },
      provider,
      [],
      ctx,
    );

    expect(surface.readDesign).toHaveBeenCalledWith('page-1');
    expect(surface.getTokens).toHaveBeenCalled();
  });

  it('writes design with tokens', async () => {
    const surface = makeDesignSurface();
    const workFn = createVisualDesignerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/wireframe' },
      provider,
      [],
      ctx,
    );

    expect(surface.writeDesign).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        tokens: expect.objectContaining({ colors: expect.any(Object) }),
      }),
    );
  });
});

describe('VISUAL_DESIGNER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(VISUAL_DESIGNER_CONTRACT.role).toBe('visual_designer');
    expect(VISUAL_DESIGNER_CONTRACT.category).toBe('design');
  });

  it('uses review_and_override HITL policy', () => {
    expect(VISUAL_DESIGNER_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('uses stream execution mode', () => {
    expect(VISUAL_DESIGNER_CONTRACT.execution.mode).toBe('stream');
  });
});
