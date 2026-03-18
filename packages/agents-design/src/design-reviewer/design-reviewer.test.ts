import { createDesignReviewerWork, DESIGN_REVIEWER_CONTRACT } from './design-reviewer.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSurface } from '../design-surface.js';

// ============================================================================
// Helpers
// ============================================================================

const PASSING_REVIEW = JSON.stringify({
  passed: true,
  score: 95,
  issues: [],
});

const FAILING_REVIEW = JSON.stringify({
  passed: false,
  score: 62,
  issues: ['Color contrast below 4.5:1 on hero text', 'Missing focus indicators on buttons'],
});

const makeProvider = (output: string = PASSING_REVIEW): LLMProviderRef => ({
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
    html: '<div class="page" style="color: #333">Visual design</div>',
    metadata: { name: 'Dashboard', version: 2 },
    lastModified: '2026-01-01T00:00:00Z',
  })),
  writeDesign: jest.fn().mockResolvedValue(Ok(undefined)),
  getTokens: jest.fn().mockResolvedValue(Ok({ colors: {}, typography: {}, spacing: {} })),
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

describe('createDesignReviewerWork', () => {
  it('returns passed=true for a passing review', async () => {
    const surface = makeDesignSurface();
    const workFn = createDesignReviewerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider(PASSING_REVIEW);

    const result = await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/visual' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.score).toBe(95);
      expect(result.value.issues).toHaveLength(0);
    }
  });

  it('publishes DesignPhaseComplete when review passes', async () => {
    const surface = makeDesignSurface();
    const workFn = createDesignReviewerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider(PASSING_REVIEW);

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/visual' },
      provider,
      [],
      ctx,
    );

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DesignPhaseComplete',
        designRef: 'designs/page-1/visual',
      }),
    );
  });

  it('returns passed=false for a failing review', async () => {
    const surface = makeDesignSurface();
    const workFn = createDesignReviewerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider(FAILING_REVIEW);

    const result = await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/visual' },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.issues).toHaveLength(2);
    }
  });

  it('does NOT publish DesignPhaseComplete when review fails', async () => {
    const surface = makeDesignSurface();
    const workFn = createDesignReviewerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider(FAILING_REVIEW);

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/visual' },
      provider,
      [],
      ctx,
    );

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const phaseComplete = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'DesignPhaseComplete',
    );
    expect(phaseComplete).toBeUndefined();
  });

  it('reads design from the surface', async () => {
    const surface = makeDesignSurface();
    const workFn = createDesignReviewerWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', designRef: 'designs/page-1/visual' },
      provider,
      [],
      ctx,
    );

    expect(surface.readDesign).toHaveBeenCalledWith('page-1');
  });
});

describe('DESIGN_REVIEWER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(DESIGN_REVIEWER_CONTRACT.role).toBe('design_reviewer');
    expect(DESIGN_REVIEWER_CONTRACT.category).toBe('design');
  });

  it('uses notify_only HITL policy', () => {
    expect(DESIGN_REVIEWER_CONTRACT.hitl_policy).toBe('notify_only');
  });

  it('denies write_design permission', () => {
    expect(DESIGN_REVIEWER_CONTRACT.denied).toContain('write_design');
  });
});
