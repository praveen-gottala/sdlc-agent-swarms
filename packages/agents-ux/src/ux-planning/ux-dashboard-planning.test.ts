import {
  UX_DASHBOARD_PLANNING_CONTRACT,
  parsePlanningOutput,
  registerUXDashboardPlanning,
} from './ux-dashboard-planning.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const PLANNING_OUTPUT = JSON.stringify({
  specRef: 'spec-mod-001-1234',
  moduleId: 'mod-001',
  componentTree: [
    {
      name: 'DashboardLayout',
      props: ['columns', 'gap'],
      children: [
        { name: 'MetricsCard', props: ['title', 'value'], children: [] },
      ],
    },
  ],
  tokenBindings: {
    'DashboardLayout.gap': 'spacing.lg',
    'MetricsCard.background': 'color.surface.primary',
  },
  responsiveRules: [
    { breakpoint: 'desktop', behavior: '3-column grid with 24px gap' },
    { breakpoint: 'tablet', behavior: '2-column grid with 16px gap' },
  ],
  implementationStages: [
    { stage: 'layout', tasks: ['Create grid container'] },
    { stage: 'theme', tasks: ['Bind color tokens'] },
    { stage: 'animation', tasks: ['Add enter transitions'] },
    { stage: 'implementation', tasks: ['Connect data hooks'] },
  ],
});

const makeProvider = (output: string = PLANNING_OUTPUT): LLMProviderRef => ({
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

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('pages: []')),
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

describe('UX_DASHBOARD_PLANNING_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_DASHBOARD_PLANNING_CONTRACT.role).toBe('ux_dashboard_planning');
    expect(UX_DASHBOARD_PLANNING_CONTRACT.category).toBe('design');
    expect(UX_DASHBOARD_PLANNING_CONTRACT.provider).toBe('claude-sonnet-4');
    expect(UX_DASHBOARD_PLANNING_CONTRACT.tools).toEqual(['figma:get_variable_defs', 'figma:get_code_connect_map']);
    expect(UX_DASHBOARD_PLANNING_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_design_system', 'write_spec']);
    expect(UX_DASHBOARD_PLANNING_CONTRACT.denied).toEqual(['write_code', 'create_branch']);
    expect(UX_DASHBOARD_PLANNING_CONTRACT.budget).toEqual({ max_tokens_per_task: 30000, max_cost_per_task_usd: 1.0 });
    expect(UX_DASHBOARD_PLANNING_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: false, max_context_tokens: 30000 });
    expect(UX_DASHBOARD_PLANNING_CONTRACT.hitl_policy).toBe('review_and_override');
    expect(UX_DASHBOARD_PLANNING_CONTRACT.on_complete).toBe('ComponentSpecReady');
  });

  it('contract on_complete matches ComponentSpecReady event', () => {
    expect(UX_DASHBOARD_PLANNING_CONTRACT.on_complete).toBe('ComponentSpecReady');
  });
});

describe('parsePlanningOutput', () => {
  it('handles valid JSON', () => {
    const result = parsePlanningOutput(PLANNING_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.specRef).toBe('spec-mod-001-1234');
      expect(result.value.moduleId).toBe('mod-001');
      expect(result.value.componentTree).toHaveLength(1);
      expect(result.value.componentTree[0].name).toBe('DashboardLayout');
      expect(result.value.tokenBindings['DashboardLayout.gap']).toBe('spacing.lg');
      expect(result.value.responsiveRules).toHaveLength(2);
      expect(result.value.implementationStages).toHaveLength(4);
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + PLANNING_OUTPUT + '\n```';
    const result = parsePlanningOutput(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.specRef).toBe('spec-mod-001-1234');
      expect(result.value.moduleId).toBe('mod-001');
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parsePlanningOutput('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });
});

describe('registerUXDashboardPlanning', () => {
  it('subscribes to DesignBriefCompleted', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXDashboardPlanning(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'DesignBriefCompleted',
      expect.any(Function),
    );
  });
});
