import {
  UX_PLANNING_CONTRACT,
  parsePlanningOutput,
  registerUXPlanning,
  extractValidTokenNames,
  validateTokenBindings,
  parseTokenBindingsCorrection,
  applyDotNotationFallback,
  filterNonTokenBindings,
  uxPlanningWork,
} from './ux-planning.js';
import type { AgentContext, LLMProviderRef, DesignTokensSpec } from '@agentforge/core';
import { Ok, DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const PLANNING_OUTPUT_OBJ = {
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
};

const PLANNING_OUTPUT = JSON.stringify(PLANNING_OUTPUT_OBJ);

/**
 * Create a mock provider. When `structured` is true (default), the provider
 * returns both `content` and `structured` fields, simulating Anthropic's
 * structured output via output_config. Set `structured` to false to test
 * the text-fallback path.
 */
const makeProvider = (output: string = PLANNING_OUTPUT, structured = true): LLMProviderRef => {
  const parsed = (() => { try { return JSON.parse(output) as Record<string, unknown>; } catch { return undefined; } })();
  return {
    name: 'test-provider',
    complete: jest.fn().mockResolvedValue(Ok({
      content: output,
      ...(structured && parsed ? { structured: parsed } : {}),
    })),
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      estimatedCostUsd: 0.01,
      confidence: 'medium' as const,
    }),
  };
};

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

describe('UX_PLANNING_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_PLANNING_CONTRACT.role).toBe('ux_planning');
    expect(UX_PLANNING_CONTRACT.category).toBe('design');
    expect(UX_PLANNING_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(UX_PLANNING_CONTRACT.tools).toEqual([]);
    expect(UX_PLANNING_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_design_system', 'write_spec']);
    expect(UX_PLANNING_CONTRACT.denied).toEqual(['write_code', 'create_branch']);
    expect(UX_PLANNING_CONTRACT.budget).toEqual({ max_tokens_per_task: 30000, max_cost_per_task_usd: 1.0 });
    expect(UX_PLANNING_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: false, max_context_tokens: 30000 });
    expect(UX_PLANNING_CONTRACT.hitl_policy).toBe('review_and_override');
    expect(UX_PLANNING_CONTRACT.on_complete).toBe('ComponentSpecReady');
  });

  it('contract on_complete matches ComponentSpecReady event', () => {
    expect(UX_PLANNING_CONTRACT.on_complete).toBe('ComponentSpecReady');
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

describe('registerUXPlanning', () => {
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

    registerUXPlanning(mockEventBus, ctx);

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
  elevation: { levels: [
    { level: 0, shadow: 'none', description: 'Flat' },
    { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.12)', description: 'Cards resting' },
    { level: 2, shadow: '0 4px 6px rgba(0,0,0,0.15)', description: 'Dropdowns' },
    { level: 3, shadow: '0 10px 20px rgba(0,0,0,0.2)', description: 'Modals' },
  ] },
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

  it('includes elevation level names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('elevation-0')).toBe(true);
    expect(names.has('elevation-1')).toBe(true);
    expect(names.has('elevation-2')).toBe(true);
    expect(names.has('elevation-3')).toBe(true);
  });

  it('includes layout tokens', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('content-max-width')).toBe(true);
    expect(names.has('grid-columns')).toBe(true);
    expect(names.has('grid-gutter')).toBe(true);
    expect(names.has('grid-margin')).toBe(true);
  });

  it('includes breakpoint names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('breakpoint-mobile')).toBe(true);
    expect(names.has('breakpoint-tablet')).toBe(true);
    expect(names.has('breakpoint-desktop')).toBe(true);
    expect(names.has('breakpoint-wide')).toBe(true);
  });

  it('includes touch target tokens', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('touch-min-height')).toBe(true);
    expect(names.has('touch-min-width')).toBe(true);
  });

  it('includes z-index names', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('z-dropdown')).toBe(true);
    expect(names.has('z-sticky')).toBe(true);
    expect(names.has('z-modal')).toBe(true);
    expect(names.has('z-toast')).toBe(true);
    expect(names.has('z-tooltip')).toBe(true);
  });

  it('includes brand motion tokens when brand is provided', () => {
    const brand: import('@agentforge/core').BrandSpec = {
      version: '1.0',
      created_by: 'test',
      identity: { tone: 'playful', audience: 'general' },
      illustration_style: { direction: 'flat', description: 'simple flat' },
      motion_principles: {
        page_transitions: 'fade',
        interaction_feel: 'snappy',
        easing: 'ease-out',
        duration_base_ms: 200,
      },
      accessibility: { wcag_level: 'AA' },
    };
    const names = extractValidTokenNames(SAMPLE_TOKENS, brand);
    expect(names.has('duration-base')).toBe(true);
    expect(names.has('easing-default')).toBe(true);
  });

  it('does NOT include motion tokens when brand is not provided', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('duration-base')).toBe(false);
    expect(names.has('easing-default')).toBe(false);
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
    surface-primary: cream
    text-primary: teal
    cta-primary: teal
    border-default: teal
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
  minimum_width: 44
elevation:
  levels:
    - level: 0
      shadow: none
      description: Flat
    - level: 1
      shadow: "0 1px 3px rgba(0,0,0,0.12)"
      description: Cards resting
layout:
  grid:
    columns: 12
    gutter: 24
    margin: 24
  content_max_width: 1280
  breakpoints:
    mobile: 640
    tablet: 768
    desktop: 1024
    wide: 1440
z_index:
  dropdown: 1000
  sticky: 1100
  modal: 1200
  toast: 1300
  tooltip: 1400`;

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

describe('uxPlanningWork — disk-first token loading', () => {
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
      return path.endsWith('agentforge/spec') || path.includes('design-tokens.yaml');
    });

    const result = await uxPlanningWork(
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

    const result = await uxPlanningWork(
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

// ============================================================================
// parseTokenBindingsCorrection
// ============================================================================

describe('parseTokenBindingsCorrection', () => {
  it('parses bare JSON with tokenBindings', () => {
    const input = JSON.stringify({
      tokenBindings: { 'Card.bg': 'surface-primary', 'Card.text': 'text-primary' },
    });
    const result = parseTokenBindingsCorrection(input);
    expect(result).toEqual({ 'Card.bg': 'surface-primary', 'Card.text': 'text-primary' });
  });

  it('parses code-fenced JSON with tokenBindings', () => {
    const json = JSON.stringify({
      tokenBindings: { 'Card.bg': 'surface-primary' },
    });
    const input = '```json\n' + json + '\n```';
    const result = parseTokenBindingsCorrection(input);
    expect(result).toEqual({ 'Card.bg': 'surface-primary' });
  });

  it('returns null for malformed JSON', () => {
    expect(parseTokenBindingsCorrection('not json')).toBeNull();
  });

  it('returns null when tokenBindings field is missing', () => {
    const input = JSON.stringify({ componentTree: [] });
    expect(parseTokenBindingsCorrection(input)).toBeNull();
  });
});

// ============================================================================
// applyDotNotationFallback
// ============================================================================

describe('applyDotNotationFallback', () => {
  const validNames = extractValidTokenNames(SAMPLE_TOKENS);

  it('corrects dot-notation names using DOT_NOTATION_HINTS', () => {
    const bindings = {
      'Card.bg': 'color.surface.primary',
      'Card.border': 'color.border.default',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Card.bg']).toBe('surface-primary');
    expect(corrected['Card.border']).toBe('border-default');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('does not modify already-valid names', () => {
    const bindings = {
      'Card.bg': 'surface-primary',
      'Card.gap': '24',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected).toEqual(bindings);
    expect(corrections).toHaveLength(0);
    expect(remaining).toHaveLength(0);
  });

  it('reports remaining unresolvable names', () => {
    const bindings = {
      'Card.bg': 'totally-unknown-token',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Card.bg']).toBe('totally-unknown-token');
    expect(corrections).toHaveLength(0);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain('no known mapping');
  });

  it('handles mixed valid, correctable, and unknown names', () => {
    const bindings = {
      'Card.bg': 'surface-primary',
      'Card.text': 'color.text.primary',
      'Card.accent': 'invented-name',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Card.bg']).toBe('surface-primary');
    expect(corrected['Card.text']).toBe('text-primary');
    expect(corrected['Card.accent']).toBe('invented-name');
    expect(corrections).toHaveLength(1);
    expect(remaining).toHaveLength(1);
  });

  it('corrects elevation dot-notation hints', () => {
    const bindings = {
      'Card.shadow': 'elevation.1',
      'Modal.shadow': 'shadow.3',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Card.shadow']).toBe('elevation-1');
    expect(corrected['Modal.shadow']).toBe('elevation-3');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('corrects layout dot-notation hints', () => {
    const bindings = {
      'App.maxWidth': 'layout.maxWidth',
      'App.contentMax': 'layout.contentMaxWidth',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['App.maxWidth']).toBe('content-max-width');
    expect(corrected['App.contentMax']).toBe('content-max-width');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('corrects touch target dot-notation hints', () => {
    const bindings = {
      'Button.minHeight': 'touch.minHeight',
      'Button.minWidth': 'touchTarget.minWidth',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Button.minHeight']).toBe('touch-min-height');
    expect(corrected['Button.minWidth']).toBe('touch-min-width');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('corrects z-index dot-notation hints', () => {
    const bindings = {
      'Dropdown.zIndex': 'zIndex.dropdown',
      'Modal.zIndex': 'z_index.modal',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, validNames);
    expect(corrected['Dropdown.zIndex']).toBe('z-dropdown');
    expect(corrected['Modal.zIndex']).toBe('z-modal');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });

  it('corrects motion dot-notation hints', () => {
    const brand: import('@agentforge/core').BrandSpec = {
      version: '1.0',
      created_by: 'test',
      identity: { tone: 'playful', audience: 'general' },
      illustration_style: { direction: 'flat', description: 'simple flat' },
      motion_principles: {
        page_transitions: 'fade',
        interaction_feel: 'snappy',
        easing: 'ease-out',
        duration_base_ms: 200,
      },
      accessibility: { wcag_level: 'AA' },
    };
    const namesWithMotion = extractValidTokenNames(SAMPLE_TOKENS, brand);
    const bindings = {
      'Card.duration': 'motion.duration',
      'Card.easing': 'animation.easing',
    };
    const { corrected, corrections, remaining } = applyDotNotationFallback(bindings, namesWithMotion);
    expect(corrected['Card.duration']).toBe('duration-base');
    expect(corrected['Card.easing']).toBe('easing-default');
    expect(corrections).toHaveLength(2);
    expect(remaining).toHaveLength(0);
  });
});

// ============================================================================
// Regression: bug report bindings using new token names
// ============================================================================

describe('validateTokenBindings — regression for missing categories', () => {
  const validNames = extractValidTokenNames(SAMPLE_TOKENS);

  it('accepts elevation, layout, touch, z-index token names that previously failed', () => {
    const bindings = {
      'Card.shadow': 'elevation-1',
      'App.maxWidth': 'content-max-width',
      'App.gridColumns': 'grid-columns',
      'Button.minHeight': 'touch-min-height',
      'Modal.zIndex': 'z-modal',
      'Dropdown.zIndex': 'z-dropdown',
      'App.breakpoint': 'breakpoint-tablet',
    };
    const warnings = validateTokenBindings(bindings, validNames);
    expect(warnings).toHaveLength(0);
  });

  it('still rejects truly invalid names', () => {
    const bindings = {
      'Card.shadow': '0 2px 8px rgba(0,0,0,0.15)',
      'App.maxWidth': '1280',
      'Button.minHeight': '44',
    };
    const warnings = validateTokenBindings(bindings, validNames);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Token binding retry loop (integration)
// ============================================================================

describe('uxPlanningWork — token binding retry loop', () => {
  const BAD_PLANNING_OUTPUT = JSON.stringify({
    specRef: 'spec-mod-001-1234',
    moduleId: 'mod-001',
    componentTree: [{ name: 'Card', props: ['title'], children: [] }],
    tokenBindings: {
      'Card.background': 'color.surface.primary',
      'Card.text': 'color.text.primary',
    },
    responsiveRules: [{ breakpoint: 'desktop', behavior: '3-col grid' }],
  });

  const CORRECTED_BINDINGS = JSON.stringify({
    tokenBindings: {
      'Card.background': 'surface-primary',
      'Card.text': 'text-primary',
    },
  });

  const setupContext = () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return { ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } };
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => path.endsWith('agentforge/spec') || path.includes('design-tokens.yaml'));
    return ctx;
  };

  it('resolves dot-notation token names deterministically without LLM retry', async () => {
    const badParsed = JSON.parse(BAD_PLANNING_OUTPUT) as Record<string, unknown>;
    const provider = makeProvider(BAD_PLANNING_OUTPUT);
    (provider.complete as jest.Mock)
      .mockResolvedValueOnce(Ok({ content: BAD_PLANNING_OUTPUT, structured: badParsed }));

    const ctx = setupContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tokenBindings['Card.background']).toBe('surface-primary');
      expect(result.value.tokenBindings['Card.text']).toBe('text-primary');
    }
    // Only the initial call — DOT_NOTATION_HINTS resolved everything
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deterministic token corrections'));

    warnSpy.mockRestore();
  });

  it('does not retry when all token bindings are valid', async () => {
    const provider = makeProvider();
    const ctx = setupContext();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    // Only the initial call, no retries
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('retries via LLM when deterministic fix cannot resolve unknown names', async () => {
    // These names are NOT in DOT_NOTATION_HINTS, so deterministic fix won't resolve them
    const unknownOutput = JSON.stringify({
      specRef: 'spec-mod-001-1234',
      moduleId: 'mod-001',
      componentTree: [{ name: 'Card', props: ['title'], children: [] }],
      tokenBindings: {
        'Card.background': 'brand-accent-glow',
        'Card.text': 'custom-text-emphasis',
      },
      responsiveRules: [{ breakpoint: 'desktop', behavior: '3-col grid' }],
    });
    const unknownParsed = JSON.parse(unknownOutput) as Record<string, unknown>;
    const provider = makeProvider(unknownOutput);
    // All calls return the same unknown tokens — exhausts retries
    (provider.complete as jest.Mock).mockResolvedValue(Ok({ content: unknownOutput, structured: unknownParsed }));

    const ctx = setupContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    // Initial call + 2 retries (max) since deterministic fix couldn't resolve these
    expect(provider.complete).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unresolvable token bindings'));

    warnSpy.mockRestore();
  });

  it('sends original output and warnings in retry prompt for non-hinted names', async () => {
    // Use names NOT in DOT_NOTATION_HINTS to trigger LLM retry
    const unknownOutput = JSON.stringify({
      specRef: 'spec-mod-001-1234',
      moduleId: 'mod-001',
      componentTree: [{ name: 'Card', props: ['title'], children: [] }],
      tokenBindings: {
        'Card.background': 'brand-accent-glow',
      },
      responsiveRules: [{ breakpoint: 'desktop', behavior: '3-col grid' }],
    });
    const unknownParsed = JSON.parse(unknownOutput) as Record<string, unknown>;
    const correctedParsed = JSON.parse(CORRECTED_BINDINGS) as Record<string, unknown>;
    const provider = makeProvider(unknownOutput);
    (provider.complete as jest.Mock)
      .mockResolvedValueOnce(Ok({ content: unknownOutput, structured: unknownParsed }))
      .mockResolvedValueOnce(Ok({ content: CORRECTED_BINDINGS, structured: correctedParsed }));

    const ctx = setupContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    // Second call should be the retry with correction prompt
    const retryCallArgs = (provider.complete as jest.Mock).mock.calls[1][0];
    expect(retryCallArgs.messages).toHaveLength(3); // original user + assistant + correction
    expect(retryCallArgs.messages[1].role).toBe('assistant');
    expect(retryCallArgs.messages[1].content).toBe(unknownOutput);
    expect(retryCallArgs.messages[2].role).toBe('user');
    expect(retryCallArgs.messages[2].content).toContain('invalid token binding names');

    warnSpy.mockRestore();
  });

  it('deterministic correction flows through to final Ok result preserving other fields', async () => {
    const badParsed = JSON.parse(BAD_PLANNING_OUTPUT) as Record<string, unknown>;
    const provider = makeProvider(BAD_PLANNING_OUTPUT);
    (provider.complete as jest.Mock)
      .mockResolvedValueOnce(Ok({ content: BAD_PLANNING_OUTPUT, structured: badParsed }));

    const ctx = setupContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Verify deterministic corrections resolved dot-notation names
      const bindings = result.value.tokenBindings;
      for (const value of Object.values(bindings)) {
        expect(value).not.toContain('color.');
      }
      expect(bindings['Card.background']).toBe('surface-primary');
      expect(bindings['Card.text']).toBe('text-primary');
      // Other fields should be preserved from original output
      expect(result.value.componentTree[0].name).toBe('Card');
      expect(result.value.specRef).toBe('spec-mod-001-1234');
    }
    // Only 1 LLM call — deterministic fix handled it
    expect(provider.complete).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});

// ============================================================================
// Structured output integration
// ============================================================================

describe('uxPlanningWork — structured output', () => {
  const setupContext = () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockImplementation((path: string) => {
      if (path.includes('design-tokens.yaml')) {
        return Ok(DISK_TOKENS_YAML);
      }
      return { ok: false, error: { code: 'INVALID_STATE', message: 'not found', recoverable: false } };
    });
    (ctx.fs.exists as jest.Mock).mockImplementation((path: string) => path.endsWith('agentforge/spec') || path.includes('design-tokens.yaml'));
    return ctx;
  };

  it('passes responseSchema in completion options', async () => {
    const provider = makeProvider();
    const ctx = setupContext();

    await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    const callOptions = (provider.complete as jest.Mock).mock.calls[0][1];
    expect(callOptions.responseSchema).toBeDefined();
    expect(callOptions.responseSchema.schema.type).toBe('object');
    expect(callOptions.responseSchema.schema.required).toContain('tokenBindings');
  });

  it('uses structured field when present in provider response', async () => {
    const provider = makeProvider(PLANNING_OUTPUT, true);
    const ctx = setupContext();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.specRef).toBe('spec-mod-001-1234');
      expect(result.value.tokenBindings['MetricsCard.background']).toBe('surface-primary');
    }
  });

  it('falls back to text parsing when structured field is absent', async () => {
    const provider = makeProvider(PLANNING_OUTPUT, false);
    const ctx = setupContext();

    const result = await uxPlanningWork(PLANNING_INPUT, provider as unknown as LLMProviderRef, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.specRef).toBe('spec-mod-001-1234');
      expect(result.value.tokenBindings['MetricsCard.background']).toBe('surface-primary');
    }
  });
});

// ============================================================================
// filterNonTokenBindings
// ============================================================================

describe('filterNonTokenBindings', () => {
  const validNames = new Set([
    'surface-primary', 'text-primary', 'heading-1', 'body',
    'border-default', 'medium', 'elevation-1', 'touch-min-height',
    '4', '8', '12', '16', '24', '32', '48', '64', '0',
  ]);

  it('removes always-non-token keys regardless of value', () => {
    const bindings = {
      'Grid.columns': '3',
      'Banner.ariaLive': 'polite',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({ 'Section.background': 'surface-primary' });
    expect(removed).toContain('Grid.columns');
    expect(removed).toContain('Banner.ariaLive');
  });

  it('removes dimension keys when value is not a valid token', () => {
    const bindings = {
      'Sidebar.width': '280',
      'Card.imageHeight': '200',
      'Header.height': '56',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({ 'Section.background': 'surface-primary' });
    expect(removed).toHaveLength(3);
  });

  it('keeps dimension keys when value IS a valid token name', () => {
    const bindings = {
      'Button.height': 'touch-min-height',
      'Section.background': 'surface-primary',
    };
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual({
      'Button.height': 'touch-min-height',
      'Section.background': 'surface-primary',
    });
    expect(removed).toHaveLength(0);
  });

  it('keeps spacing scale values in tokenBindings', () => {
    const bindings = {
      'Section.gap': '24',
      'Layout.padding': '32',
    };
    // Note: gap and padding don't match dimension key patterns,
    // so they pass through. Their values (24, 32) are valid spacing tokens.
    const { cleaned, removed } = filterNonTokenBindings(bindings, validNames);
    expect(cleaned).toEqual(bindings);
    expect(removed).toHaveLength(0);
  });

  it('handles empty bindings', () => {
    const { cleaned, removed } = filterNonTokenBindings({}, validNames);
    expect(cleaned).toEqual({});
    expect(removed).toHaveLength(0);
  });
});

// ============================================================================
// extractValidTokenNames includes "0"
// ============================================================================

describe('extractValidTokenNames — zero spacing', () => {
  it('includes "0" as valid spacing', () => {
    const names = extractValidTokenNames(SAMPLE_TOKENS);
    expect(names.has('0')).toBe(true);
  });
});
