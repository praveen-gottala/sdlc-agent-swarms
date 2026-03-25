import {
  UX_DASHBOARD_DESIGN_CONTRACT,
  parseDesignSteps,
  buildPerScreenPrompt,
  registerUXDashboardDesign,
} from './ux-dashboard-design.js';
import { applyDesignFeedback } from './design-collaboration.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok, DEFAULT_MODEL } from '@agentforge/core';
import type { UXDashboardDesignOutput } from './ux-dashboard-design.js';
import type { ScreenDefinition } from '../types.js';
import type { UXDashboardPlanningOutput } from '../ux-planning/ux-dashboard-planning.js';

// ============================================================================
// Helpers
// ============================================================================

const SAMPLE_STEPS_OUTPUT = JSON.stringify({
  steps: [
    {
      tool: 'create_frame',
      params: { name: 'DashboardLayout', width: 1440, height: 900 },
      componentRef: 'DashboardLayout',
      description: 'Create root dashboard frame at desktop width',
    },
    {
      tool: 'set_layout_mode',
      params: { nodeId: 'node-root', mode: 'VERTICAL', spacing: 24 },
      componentRef: 'DashboardLayout',
      description: 'Set auto-layout on dashboard container',
    },
    {
      tool: 'create_frame',
      params: { name: 'MetricsCard', width: 300, height: 200 },
      componentRef: 'MetricsCard',
      description: 'Create metrics card component',
    },
    {
      tool: 'set_fill_color',
      params: { nodeId: 'node-card', r: 255, g: 255, b: 255 },
      componentRef: 'MetricsCard',
      description: 'Apply surface color token to metrics card',
    },
    {
      tool: 'create_frame',
      params: { name: 'AgentCard', width: 280, height: 160 },
      componentRef: 'AgentCard',
      description: 'Create agent card component',
    },
    {
      tool: 'create_frame',
      params: { name: 'DashboardLayout-tablet', width: 768, height: 900 },
      componentRef: 'DashboardLayout-tablet',
      description: 'Create tablet breakpoint frame',
    },
    {
      tool: 'create_frame',
      params: { name: 'DashboardLayout-mobile', width: 375, height: 900 },
      componentRef: 'DashboardLayout-mobile',
      description: 'Create mobile breakpoint frame',
    },
  ],
  breakpoints: ['1440', '768', '375'],
});

const makeProvider = (output: string = SAMPLE_STEPS_OUTPUT): LLMProviderRef => ({
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
    callTool: jest.fn().mockResolvedValue(Ok({ nodeId: 'node-xxx' })),
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

describe('UX_DASHBOARD_DESIGN_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_DASHBOARD_DESIGN_CONTRACT.role).toBe('ux_dashboard_design');
    expect(UX_DASHBOARD_DESIGN_CONTRACT.category).toBe('design');
    expect(UX_DASHBOARD_DESIGN_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(UX_DASHBOARD_DESIGN_CONTRACT.tools).toHaveLength(41);
    expect(UX_DASHBOARD_DESIGN_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'write_design', 'read_design_system']);
    expect(UX_DASHBOARD_DESIGN_CONTRACT.denied).toEqual(['write_code', 'create_branch', 'merge_pr']);
    expect(UX_DASHBOARD_DESIGN_CONTRACT.budget).toEqual({ max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 });
    expect(UX_DASHBOARD_DESIGN_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: true, max_context_tokens: 40000 });
  });

  it('contract on_complete matches FigmaDesignReady event', () => {
    expect(UX_DASHBOARD_DESIGN_CONTRACT.on_complete).toBe('FigmaDesignReady');
  });

  it('contract hitl_policy is full_approval', () => {
    expect(UX_DASHBOARD_DESIGN_CONTRACT.hitl_policy).toBe('full_approval');
  });

  it('contract tools include TalkToFigma write tools plus read tools', () => {
    const tools = UX_DASHBOARD_DESIGN_CONTRACT.tools;
    expect(tools).toContain('figma:get_document_info');
    expect(tools).toContain('figma:get_selection');
    expect(tools).toContain('figma-write:create_frame');
    expect(tools).toContain('figma-write:set_fill_color');
    expect(tools).toContain('figma-write:set_layout_mode');
    expect(tools).toContain('figma-write:set_corner_radius');
    expect(tools).toContain('figma:get_node_info');
    expect(tools).toContain('figma:scan_nodes_by_types');
  });
});

describe('parseDesignSteps', () => {
  it('handles valid JSON with steps array', () => {
    const result = parseDesignSteps(SAMPLE_STEPS_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(7);
      expect(result.value.steps[0].tool).toBe('create_frame');
      expect(result.value.steps[0].componentRef).toBe('DashboardLayout');
      expect(result.value.breakpoints).toEqual(['1440', '768', '375']);
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + SAMPLE_STEPS_OUTPUT + '\n```';
    const result = parseDesignSteps(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps).toHaveLength(7);
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parseDesignSteps('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });

  it('validates tool names against allowed set', () => {
    const invalidSteps = JSON.stringify({
      steps: [
        {
          tool: 'delete_all_nodes',
          params: {},
          componentRef: 'root',
          description: 'invalid tool',
        },
      ],
      breakpoints: [],
    });
    const result = parseDesignSteps(invalidSteps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('delete_all_nodes');
    }
  });

  it('creation plan has steps for every component in sample tree', () => {
    const result = parseDesignSteps(SAMPLE_STEPS_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const componentRefs = result.value.steps.map((s) => s.componentRef);
      expect(componentRefs).toContain('DashboardLayout');
      expect(componentRefs).toContain('MetricsCard');
      expect(componentRefs).toContain('AgentCard');
    }
  });

  it('token bindings map to set_fill_color steps', () => {
    const result = parseDesignSteps(SAMPLE_STEPS_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const fillSteps = result.value.steps.filter((s) => s.tool === 'set_fill_color');
      expect(fillSteps.length).toBeGreaterThan(0);
      expect(fillSteps[0].componentRef).toBe('MetricsCard');
    }
  });

  it('responsive breakpoints generate frames at correct widths (375, 768, 1440)', () => {
    const result = parseDesignSteps(SAMPLE_STEPS_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.breakpoints).toContain('375');
      expect(result.value.breakpoints).toContain('768');
      expect(result.value.breakpoints).toContain('1440');

      const frameSteps = result.value.steps.filter((s) => s.tool === 'create_frame');
      const widths = frameSteps.map((s) => (s.params as Record<string, unknown>).width as number);
      expect(widths).toContain(1440);
      expect(widths).toContain(768);
      expect(widths).toContain(375);
    }
  });
});

describe('applyDesignFeedback', () => {
  it('produces modification steps from text feedback', async () => {
    const modificationOutput = JSON.stringify({
      steps: [
        {
          tool: 'set_fill_color',
          params: { nodeId: 'node-1', r: 0, g: 100, b: 200 },
          componentRef: 'MetricsCard',
          description: 'Change card color per feedback',
        },
      ],
      breakpoints: [],
    });

    const mockMcpClient = {
      callTool: jest.fn().mockResolvedValue(Ok({ nodeId: 'node-updated' })),
    };
    const mockProvider = {
      complete: jest.fn().mockResolvedValue(Ok({ content: modificationOutput })),
    };

    const currentDesign: UXDashboardDesignOutput = {
      figmaFileId: 'file-1',
      figmaPageId: 'page-1',
      figmaNodeIds: { DashboardLayout: 'node-1', MetricsCard: 'node-2' },
      moduleId: 'mod-001',
      breakpoints: ['1440', '768', '375'],
    };

    const result = await applyDesignFeedback(
      'Make the cards blue',
      currentDesign,
      mockMcpClient,
      mockProvider,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moduleId).toBe('mod-001');
      expect(mockProvider.complete).toHaveBeenCalledTimes(1);
      expect(mockMcpClient.callTool).toHaveBeenCalled();
    }
  });
});

describe('registerUXDashboardDesign', () => {
  it('subscribes to ComponentSpecReady', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXDashboardDesign(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'ComponentSpecReady',
      expect.any(Function),
    );
  });
});

// ============================================================================
// Per-screen prompt building
// ============================================================================

describe('buildPerScreenPrompt', () => {
  const makePlanningOutput = (): UXDashboardPlanningOutput => ({
    specRef: 'spec-001',
    moduleId: 'mod-001',
    componentTree: [
      { name: 'AppLayout', props: ['columns'], children: [] },
      { name: 'MetricsRow', props: [], children: [] },
    ],
    tokenBindings: {},
    responsiveRules: [],
    implementationStages: [],
  });

  const screen: ScreenDefinition = {
    screenId: 'home',
    name: 'Home Dashboard',
    componentNames: ['AppLayout', 'MetricsRow'],
    route: '/',
  };

  it('includes screen name in prompt', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 0,
      screenPlanningOutput: makePlanningOutput(),
      moduleId: 'mod-001',
      previousScreenRefs: [],
      learnings: [],
    });
    expect(prompt.messages[0].content).toContain('Home Dashboard');
    expect(prompt.messages[0].content).toContain('home');
  });

  it('includes previous screen refs when provided', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 1,
      screenPlanningOutput: makePlanningOutput(),
      moduleId: 'mod-001',
      previousScreenRefs: ['SidebarNav', 'HeaderBar'],
      learnings: [],
    });
    expect(prompt.messages[0].content).toContain('SidebarNav');
    expect(prompt.messages[0].content).toContain('do NOT recreate');
  });

  it('includes grid position for non-zero screen index', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 2,
      screenPlanningOutput: makePlanningOutput(),
      moduleId: 'mod-001',
      previousScreenRefs: [],
      learnings: [],
    });
    expect(prompt.messages[0].content).toContain('x=3000');
    expect(prompt.messages[0].content).toContain('y=0');
  });

  it('appends design system prompt when provided', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 0,
      screenPlanningOutput: makePlanningOutput(),
      designSystemPrompt: '# Custom tokens\nprimary: #FF0000',
      moduleId: 'mod-001',
      previousScreenRefs: [],
      learnings: [],
    });
    expect(prompt.system).toContain('Custom tokens');
    expect(prompt.system).toContain('Project Design Tokens');
  });

  it('includes description when provided', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 0,
      screenPlanningOutput: makePlanningOutput(),
      description: 'A gaming leaderboard app',
      moduleId: 'mod-001',
      previousScreenRefs: [],
      learnings: [],
    });
    expect(prompt.messages[0].content).toContain('gaming leaderboard app');
  });

  it('omits previous screen refs section when empty', () => {
    const prompt = buildPerScreenPrompt({
      screen,
      screenIndex: 0,
      screenPlanningOutput: makePlanningOutput(),
      moduleId: 'mod-001',
      previousScreenRefs: [],
      learnings: [],
    });
    expect(prompt.messages[0].content).not.toContain('do NOT recreate');
  });
});
