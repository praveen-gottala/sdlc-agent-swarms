/**
 * Unit tests for pipeline node functions.
 *
 * Mock-heavy: mocks uxResearchWork, uxPlanningWork, penpotDesignWork, browserDesignWork.
 * Real-codepath canonical home: pipeline-wiring-smoke.test.ts (same directory).
 */

import type { DesignPhaseState, NodeContext, PipelineStageError } from '../types.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { createRealFs } from '@agentforge/core';
import type { UXResearchOutput } from '../../ux-research/ux-research.js';
import type { UXPlanningOutput } from '../../ux-planning/ux-planning.js';

// Mock work functions before importing nodes
jest.mock('../../ux-research/ux-research.js', () => ({
  uxResearchWork: jest.fn(),
}));
jest.mock('../../ux-planning/ux-planning.js', () => ({
  uxPlanningWork: jest.fn(),
}));
jest.mock('../../ux-design/ux-penpot-design.js', () => ({
  penpotDesignWork: jest.fn(),
  PENPOT_DESIGN_CONTRACT: { provider: 'claude-sonnet-4-6' },
}));
jest.mock('../browser-design-work.js', () => ({
  browserDesignWork: jest.fn(),
}));

import { researchNode, planningNode, designNode, evaluatorNode } from '../nodes.js';
import { uxResearchWork } from '../../ux-research/ux-research.js';
import { uxPlanningWork } from '../../ux-planning/ux-planning.js';
import { penpotDesignWork } from '../../ux-design/ux-penpot-design.js';
import { browserDesignWork } from '../browser-design-work.js';

const mockedResearchWork = uxResearchWork as jest.MockedFunction<typeof uxResearchWork>;
const mockedPlanningWork = uxPlanningWork as jest.MockedFunction<typeof uxPlanningWork>;
const mockedPenpotDesignWork = penpotDesignWork as jest.MockedFunction<typeof penpotDesignWork>;
const mockedBrowserDesignWork = browserDesignWork as jest.MockedFunction<typeof browserDesignWork>;

// ── Fixtures ──

const FIXTURE_RESEARCH: UXResearchOutput = {
  briefId: 'test-page',
  moduleId: 'test-page',
  requirementIds: ['req-1'],
  designConstraints: ['mobile-first'],
  referencePatterns: ['dashboard-grid'],
  accessibilityRequirements: ['wcag-2.1-aa'],
  dataModelDependencies: ['user-model'],
};

const FIXTURE_PLANNING: UXPlanningOutput = {
  specRef: 'test-page',
  moduleId: 'test-page',
  componentTree: [],
  tokenBindings: {},
  responsiveRules: [],
};

function createProvider(): LLMProviderRef {
  return {
    name: 'test',
    complete: jest.fn(),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

function createCtx(overrides?: Partial<NodeContext>): NodeContext {
  return {
    provider: createProvider(),
    agentContext: {
      taskId: 'task-1',
      projectRoot: '/tmp/test',
      eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
      fs: createRealFs(),
      runGovernance: jest.fn(),
      resolveProvider: jest.fn(),
      recordAudit: jest.fn(),
    },
    ...overrides,
  };
}

function createState(overrides?: Partial<DesignPhaseState>): DesignPhaseState {
  return {
    moduleId: 'test-page',
    taskId: 'task-1',
    projectRoot: '/tmp/test',
    designTool: 'browser',
    prdRequirements: ['Build a dashboard'],
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

// ── researchNode ──

describe('researchNode', () => {
  it('returns research output on success', async () => {
    mockedResearchWork.mockResolvedValue({ ok: true, value: FIXTURE_RESEARCH });

    const result = await researchNode(createState(), createCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.research).toEqual(FIXTURE_RESEARCH);
    }
    expect(mockedResearchWork).toHaveBeenCalledTimes(1);
  });

  it('returns PipelineStageError on work function failure', async () => {
    mockedResearchWork.mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_STATE', message: 'Missing requirements', recoverable: false },
    });

    const result = await researchNode(createState(), createCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).stage).toBe('research');
      expect((result.error as PipelineStageError).message).toContain('Missing requirements');
    }
  });

  it('passes prdRequirements and designTokensSpec from state', async () => {
    mockedResearchWork.mockResolvedValue({ ok: true, value: FIXTURE_RESEARCH });
    const tokens = { version: '1.0', created_by: 'test', colors: { primitive: { blue: '#2563EB' }, semantic: {} } };
    const state = createState({
      prdRequirements: ['Full PRD text here with lots of content for the research agent to analyze'],
      designTokensSpec: tokens as unknown as DesignPhaseState['designTokensSpec'],
    });

    await researchNode(state, createCtx());

    const input = mockedResearchWork.mock.calls[0][0];
    expect(input.prdRequirements).toEqual(['Full PRD text here with lots of content for the research agent to analyze']);
    expect(input.designTokensSpec).toBeDefined();
    expect((input.designTokensSpec as unknown as Record<string, unknown>).colors).toBeDefined();
  });
});

// ── planningNode ──

describe('planningNode', () => {
  it('returns Err when research output is missing', async () => {
    const result = await planningNode(createState({ research: undefined }), createCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).stage).toBe('planning');
      expect((result.error as PipelineStageError).message).toContain('research output missing');
    }
    expect(mockedPlanningWork).not.toHaveBeenCalled();
  });

  it('returns planning output on success', async () => {
    mockedPlanningWork.mockResolvedValue({ ok: true, value: FIXTURE_PLANNING });

    const result = await planningNode(
      createState({ research: FIXTURE_RESEARCH }),
      createCtx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.planning).toEqual(FIXTURE_PLANNING);
    }
  });

  it('passes research briefId as briefId to planning input', async () => {
    mockedPlanningWork.mockResolvedValue({ ok: true, value: FIXTURE_PLANNING });

    await planningNode(createState({ research: FIXTURE_RESEARCH }), createCtx());

    const input = mockedPlanningWork.mock.calls[0][0];
    expect(input.briefId).toBe(FIXTURE_RESEARCH.briefId);
    expect(input.designBrief).toEqual(FIXTURE_RESEARCH);
  });
});

// ── designNode ──

describe('designNode', () => {
  it('dispatches to browserDesignWork when designTool is browser', async () => {
    mockedBrowserDesignWork.mockResolvedValue({
      ok: true,
      value: { design: { spec: {}, designToolMetadata: { tool: 'browser' as const } } },
    });

    const result = await designNode(createState({ designTool: 'browser', planning: FIXTURE_PLANNING }), createCtx());

    expect(mockedBrowserDesignWork).toHaveBeenCalledTimes(1);
    expect(mockedPenpotDesignWork).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('passes designTokensSpec to browserDesignWork via state', async () => {
    mockedBrowserDesignWork.mockResolvedValue({
      ok: true,
      value: { design: { spec: {}, designToolMetadata: { tool: 'browser' as const } } },
    });
    const tokens = { version: '1.0', created_by: 'test', colors: { primitive: { blue: '#2563EB', slate: '#334155' }, semantic: {} } };

    await designNode(
      createState({ designTool: 'browser', planning: FIXTURE_PLANNING, designTokensSpec: tokens as unknown as DesignPhaseState['designTokensSpec'] }),
      createCtx(),
    );

    const [passedState] = mockedBrowserDesignWork.mock.calls[0];
    expect(passedState.designTokensSpec).toBeDefined();
    expect((passedState.designTokensSpec as unknown as Record<string, unknown>).colors).toBeDefined();
  });

  it('dispatches to penpotDesignWork when designTool is penpot', async () => {
    mockedPenpotDesignWork.mockResolvedValue({
      ok: true,
      value: { moduleId: 'test-page', breakpoints: [], designSpec: { screen: 'test', width: 1440, nodes: {} } },
    });

    const result = await designNode(createState({ designTool: 'penpot', planning: FIXTURE_PLANNING }), createCtx());

    expect(mockedPenpotDesignWork).toHaveBeenCalledTimes(1);
    expect(mockedBrowserDesignWork).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.value.design?.designToolMetadata?.tool).toBe('penpot');
    }
  });

  it('maps chromePass generate to chromeOnly: true for penpot', async () => {
    mockedPenpotDesignWork.mockResolvedValue({
      ok: true,
      value: { moduleId: 'test-page', breakpoints: [], designSpec: { screen: 'test', width: 1440, nodes: {} } },
    });

    await designNode(
      createState({ designTool: 'penpot', planning: FIXTURE_PLANNING, chromePass: { mode: 'generate' } }),
      createCtx(),
    );

    const input = mockedPenpotDesignWork.mock.calls[0][0];
    expect(input.chromeOnly).toBe(true);
  });

  it('maps chromePass consume to frozenChromeSpec/PageId for penpot', async () => {
    mockedPenpotDesignWork.mockResolvedValue({
      ok: true,
      value: { moduleId: 'test-page', breakpoints: [], designSpec: { screen: 'test', width: 1440, nodes: {} } },
    });
    const frozenSpec = { screen: '__chrome__', width: 1440, nodes: {} } as unknown as import('@agentforge/designspec-renderer').DesignSpecV2;

    await designNode(
      createState({
        designTool: 'penpot',
        planning: FIXTURE_PLANNING,
        chromePass: { mode: 'consume', spec: frozenSpec, activePageId: 'dashboard' },
      }),
      createCtx(),
    );

    const input = mockedPenpotDesignWork.mock.calls[0][0];
    expect(input.frozenChromeSpec).toBe(frozenSpec);
    expect(input.frozenChromePageId).toBe('dashboard');
  });

  it('populates designToolMetadata with script, nodeIds, projectId from penpotDesignWork', async () => {
    mockedPenpotDesignWork.mockResolvedValue({
      ok: true,
      value: {
        moduleId: 'test-page',
        breakpoints: [],
        designSpec: { screen: 'test', width: 1440, nodes: {} },
        script: 'const root = penpot.createBoard();',
        penpotNodeIds: { 'root': 'penpot-id-123' },
        penpotProjectId: 'project-abc',
      },
    });

    const result = await designNode(createState({ designTool: 'penpot', planning: FIXTURE_PLANNING }), createCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = result.value.design?.designToolMetadata;
      expect(meta?.tool).toBe('penpot');
      expect(meta?.script).toBe('const root = penpot.createBoard();');
      expect(meta?.nodeIds).toEqual({ 'root': 'penpot-id-123' });
      expect(meta?.projectId).toBe('project-abc');
    }
  });

  it('omits script/nodeIds/projectId from metadata when penpotDesignWork does not provide them', async () => {
    mockedPenpotDesignWork.mockResolvedValue({
      ok: true,
      value: { moduleId: 'test-page', breakpoints: [], designSpec: { screen: 'test', width: 1440, nodes: {} } },
    });

    const result = await designNode(createState({ designTool: 'penpot', planning: FIXTURE_PLANNING }), createCtx());

    expect(result.ok).toBe(true);
    if (result.ok) {
      const meta = result.value.design?.designToolMetadata;
      expect(meta?.tool).toBe('penpot');
      expect(meta?.script).toBeUndefined();
      expect(meta?.nodeIds).toBeUndefined();
      expect(meta?.projectId).toBeUndefined();
    }
  });

  it('returns Err when planning is missing for penpot path', async () => {
    const result = await designNode(
      createState({ designTool: 'penpot', planning: undefined }),
      createCtx(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).message).toContain('planning output missing');
    }
  });
});

// ── evaluatorNode ──

describe('evaluatorNode', () => {
  it('returns Err when design output is missing', async () => {
    const result = await evaluatorNode(createState({ design: undefined }), createCtx());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).stage).toBe('evaluator');
    }
  });

  it('returns undefined evaluation in Phase 1 — full evaluation deferred to Phase 2 (execution-plan §2.x)', async () => {
    const result = await evaluatorNode(
      createState({ design: { spec: { screen: 'test', nodes: {} } } }),
      createCtx(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evaluation).toBeUndefined();
    }
  });
});
