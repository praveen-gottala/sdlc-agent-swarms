import { createWireframeGeneratorWork, WIREFRAME_GENERATOR_CONTRACT } from './wireframe-generator.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSurface } from '../design-surface.js';

// ============================================================================
// Helpers
// ============================================================================

const WIREFRAME_OUTPUT = JSON.stringify({
  name: 'Dashboard Wireframe',
  html: '<div class="page"><header>[Header]</header><main>[Content]</main></div>',
  sections: [
    { name: 'header', layout: 'flex-row', elements: ['logo', 'nav'] },
    { name: 'main', layout: 'flex-col', elements: ['content'] },
  ],
});

const makeProvider = (output: string = WIREFRAME_OUTPUT): LLMProviderRef => ({
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
    html: '<div>existing</div>',
    metadata: {},
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

describe('createWireframeGeneratorWork', () => {
  it('generates wireframe and writes to design surface', async () => {
    const surface = makeDesignSurface();
    const workFn = createWireframeGeneratorWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    const result = await workFn(
      { pageId: 'page-1', taskId: 'task_001', layoutSuggestions: ['Use single column'] },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.designRef).toBe('designs/page-1/wireframe');
      expect(result.value.sectionsCreated).toBe(2);
    }
  });

  it('calls writeDesign on the design surface', async () => {
    const surface = makeDesignSurface();
    const workFn = createWireframeGeneratorWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', layoutSuggestions: [] },
      provider,
      [],
      ctx,
    );

    expect(surface.writeDesign).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: 'page-1',
        name: 'Dashboard Wireframe',
      }),
    );
  });

  it('locks and unlocks the design surface', async () => {
    const surface = makeDesignSurface();
    const workFn = createWireframeGeneratorWork(surface);
    const ctx = makeContext();
    const provider = makeProvider();

    await workFn(
      { pageId: 'page-1', taskId: 'task_001', layoutSuggestions: [] },
      provider,
      [],
      ctx,
    );

    expect(surface.lockForAgent).toHaveBeenCalledWith('wireframe_generator');
    expect(surface.unlockForAgent).toHaveBeenCalledWith('wireframe_generator');
  });

  it('returns error on malformed LLM output', async () => {
    const surface = makeDesignSurface();
    const workFn = createWireframeGeneratorWork(surface);
    const ctx = makeContext();
    const provider = makeProvider('not json');

    const result = await workFn(
      { pageId: 'page-1', taskId: 'task_001', layoutSuggestions: [] },
      provider,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
  });
});

describe('WIREFRAME_GENERATOR_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(WIREFRAME_GENERATOR_CONTRACT.role).toBe('wireframe_generator');
    expect(WIREFRAME_GENERATOR_CONTRACT.category).toBe('design');
  });

  it('uses full_approval HITL policy', () => {
    expect(WIREFRAME_GENERATOR_CONTRACT.hitl_policy).toBe('full_approval');
  });

  it('uses stream execution mode', () => {
    expect(WIREFRAME_GENERATOR_CONTRACT.execution.mode).toBe('stream');
  });
});
