import {
  UX_DASHBOARD_PLANNING_CONTRACT,
  parsePlanningOutput,
  registerUXDashboardPlanning,
  extractValidTokenNames,
  validateTokenBindings,
  uxDashboardPlanningWork,
} from './ux-dashboard-planning.js';
import type { AgentContext, LLMProviderRef, DesignTokensSpec } from '@agentforge/core';
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
    'DashboardLayout.gap': '24',
    'MetricsCard.background': 'surface-primary',
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
    expect(UX_DASHBOARD_PLANNING_CONTRACT.tools).toEqual([]);
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
      expect(result.value.tokenBindings['DashboardLayout.gap']).toBe('24');
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

// ============================================================================
// Token name validation
// ============================================================================

const SAMPLE_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'test',
  colors: {
    primitive: { cream: '#FFF8E7', teal: '#0F6E56' },
    semantic: {
      'background-primary': 'cream',
      'surface-primary': 'cream',
      'text-primary': 'teal',
      'cta-primary': 'teal',
      'border-default': 'teal',
    },
  },
  typography: {
    font_families: { display: 'Inter', body: 'Inter' },
    scale: [
      { role: 'heading-1', size: 32, weight: 700, family: 'display' },
      { role: 'body', size: 14, weight: 400, family: 'body' },
    ],
  },
  spacing: { unit: 8, scale: [4, 8, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12, large: 16, pill: 9999 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: { levels: [{ level: 0, shadow: 'none', description: 'Flat' }] },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
};

describe('extractValidTokenNames', () => {
  it('includes semantic color names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('background-primary')).toBe(true);
    expect(names.has('surface-primary')).toBe(true);
    expect(names.has('text-primary')).toBe(true);
    expect(names.has('cta-primary')).toBe(true);
    expect(names.has('border-default')).toBe(true);
  });

  it('includes typography role names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('heading-1')).toBe(true);
    expect(names.has('body')).toBe(true);
  });

  it('includes spacing scale values as strings', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('4')).toBe(true);
    expect(names.has('24')).toBe(true);
    expect(names.has('32')).toBe(true);
  });

  it('includes border radius names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('small')).toBe(true);
    expect(names.has('medium')).toBe(true);
    expect(names.has('large')).toBe(true);
    expect(names.has('pill')).toBe(true);
  });

  it('does NOT include primitive color names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('cream')).toBe(false);
    expect(names.has('teal')).toBe(false);
  });
});

describe('validateTokenBindings', () => {
  const validNames = extractValidTokenNames(SAMPLE_TOKENS);

  it('returns no warnings for valid token names', () => {
    const bindings = {
      'Card.background': 'surface-primary',
      'Card.text': 'text-primary',
      'Card.gap': '24',
      'Card.radius': 'medium',
    };
    const warnings = validateTokenBindings(bindings, validNames);
    expect(warnings).toHaveLength(0);
  });

  it('warns about dot-notation names with hints', () => {
    const bindings = {
      'Card.background': 'color.surface.primary',
      'Card.border': 'color.border.input',
    };
    const warnings = validateTokenBindings(bindings, validNames);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('surface-primary');
    expect(warnings[1]).toContain('border-default');
  });

  it('warns about unknown names without hints', () => {
    const bindings = {
      'Card.background': 'nonexistent-token',
    };
    const warnings = validateTokenBindings(bindings, validNames);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('not a recognized token name');
  });
});

// ============================================================================
// Empty MCP response fallthrough
// ============================================================================

// ============================================================================
// Disk-first token loading
// ============================================================================

const DISK_TOKENS_YAML = `version: "1.0"
created_by: test
colors:
  primitive:
    cream: "#FFF8E7"
    teal: "#0F6E56"
  semantic:
    background-primary: cream
    cta-primary: teal
typography:
  font_families:
    display: Inter
    body: Inter
  scale:
    - role: heading-1
      size: 32
      weight: 700
      family: display
spacing:
  unit: 8
  scale: [4, 8, 16, 24, 32]
borders:
  radius:
    small: 8
    medium: 12
touch_targets:
  minimum_height: 44
  minimum_width: 44`;

const PLANNING_INPUT = {
  briefId: 'brief-001',
  moduleId: 'mod-001',
  taskId: 'task-001',
  designBrief: {
    briefId: 'brief-001',
    moduleId: 'mod-001',
    requirementIds: ['req-1'],
    designConstraints: ['Must show data'],
    referencePatterns: ['Card layout'],
    accessibilityRequirements: ['WCAG AA'],
    dataModelDependencies: ['User'],
  },
};

describe('uxDashboardPlanningWork — disk-first token loading', () => {
  it('uses disk tokens when available, no MCP call made', async () => {
    const provider = makeProvider();
    const ctx = makeContext();

    // fs.readFile should return the YAML for design-tokens.yaml, Err for others
    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return { ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } };
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => {
      return path.includes('design-tokens.yaml');
    });

    const result = await uxDashboardPlanningWork(
      PLANNING_INPUT,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(true);

    // Verify disk tokens used in prompt
    const callArgs = (provider.complete as jest.Mock).mock.calls[0][0];
    const userContent = callArgs.messages[0].content;
    expect(userContent).toContain('design-tokens.yaml');
    expect(userContent).not.toContain('Figma Variables API');

    // No MCP call should have been made
    expect(ctx.mcpClient.callTool).not.toHaveBeenCalled();
  });

  it('returns Err when design-tokens.yaml is missing (no MCP fallback)', async () => {
    const provider = makeProvider();
    const ctx = makeContext();

    (ctx.fs.readFile as jest.Mock).mockReturnValue({ ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } });
    (ctx.fs.exists as jest.Mock).mockReturnValue(false);

    const errSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await uxDashboardPlanningWork(
      PLANNING_INPUT,
      provider as unknown as LLMProviderRef,
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DEPENDENCY_NOT_FOUND');
      expect(result.error.recoverable).toBe(false);
    }
    expect(ctx.mcpClient.callTool).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalled();

    errSpy.mockRestore();
  });
});
