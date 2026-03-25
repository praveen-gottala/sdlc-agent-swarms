/**
 * @module pipeline-wiring-smoke
 *
 * Smoke test that verifies the pipeline wiring is correct without making
 * real LLM calls. Uses a mock provider that returns canned responses, but
 * asserts that the RIGHT inputs reach each stage.
 *
 * This test exists because the PRD-not-passed and design-system-not-wired
 * bugs both went undetected by mock-only tests that never checked whether
 * real data flowed through the pipeline.
 *
 * Runs in normal CI (no API key needed). Fast (<2s).
 */

import type {
  AgentContext,
  MCPClient,
  FileSystem,
  LLMProviderRef,
  DesignTokensSpec,
  BrandSpec,
} from '@agentforge/core';
import { Ok, Err, createEventBus } from '@agentforge/core';
import { stringify } from 'yaml';
import {
  uxDashboardResearchWork,
  uxDashboardPlanningWork,
  uxDashboardDesignWork,
  buildDesignSystemContextFromSpec,
} from '../index.js';
import type {
  UXDashboardResearchInput,
  UXDashboardPlanningInput,
  UXDashboardDesignInput,
} from '../index.js';

// ============================================================================
// Spy provider — captures prompts, returns canned LLM output
// ============================================================================

interface CapturedCall {
  system: string;
  userContent: string;
}

const createSpyProvider = (cannedResponse: string) => {
  const calls: CapturedCall[] = [];
  const provider = {
    complete: jest.fn().mockImplementation(
      (prompt: { system: string; messages: { role: string; content: string }[] }) => {
        calls.push({
          system: prompt.system,
          userContent: prompt.messages.map(m => m.content).join('\n'),
        });
        return Promise.resolve(Ok({ content: cannedResponse }));
      },
    ),
  };
  return { provider, calls };
};

// ============================================================================
// Fixtures
// ============================================================================

const BOOKSHELF_PRD = `# BookShelf
A personal library app for tracking books by ISBN, managing reading lists,
sharing reviews, and discovering new titles based on reading history.`;

const BOOKSHELF_TOKENS: DesignTokensSpec = {
  version: '1.0',
  created_by: 'smoke-test',
  colors: {
    primitive: { 'forest-green': '#228B22', cream: '#FFFDD0' },
    semantic: { 'background-primary': 'cream', 'cta-primary': 'forest-green' },
  },
  typography: {
    font_families: { display: 'Merriweather', body: 'Lato' },
    scale: [{ role: 'heading-1', size: 36, weight: 700, family: 'display' }],
  },
  spacing: { unit: 8, scale: [4, 8, 16, 24, 32] },
  borders: { radius: { small: 8, medium: 12 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  elevation: {
    levels: [
      { level: 0, shadow: 'none', description: 'Flat, no elevation' },
      { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
      { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
      { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
    ],
  },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
};

const BOOKSHELF_BRAND: BrandSpec = {
  version: '1.0',
  created_by: 'smoke-test',
  identity: { tone: 'warm and bookish', audience: 'book lovers' },
  illustration_style: { direction: 'illustrated', description: 'Cozy hand-drawn' },
  motion_principles: { page_transitions: 'fade', interaction_feel: 'gentle', easing: 'ease-in-out', duration_base_ms: 300 },
  accessibility: { wcag_level: 'AA' },
};

const CANNED_RESEARCH = JSON.stringify({
  briefId: 'brief-smoke-001',
  moduleId: 'bookshelf-home',
  requirementIds: ['req-1'],
  designConstraints: ['Must show book covers'],
  referencePatterns: ['Card grid for books'],
  accessibilityRequirements: ['WCAG AA'],
  dataModelDependencies: ['Book', 'ReadingList'],
});

const CANNED_PLANNING = JSON.stringify({
  specRef: 'spec-smoke-001',
  moduleId: 'bookshelf-home',
  componentTree: [
    { name: 'BookGrid', props: ['books'], children: [{ name: 'BookCard', props: ['title', 'author'] }] },
  ],
  tokenBindings: { 'BookCard.fill': 'surface-primary' },
  responsiveRules: [],
  implementationStages: [{ name: 'layout', components: ['BookGrid'] }],
});

const CANNED_DESIGN = JSON.stringify({
  steps: [
    { tool: 'create_frame', params: { x: 0, y: 0, width: 1440, height: 900, name: 'BookGrid' }, componentRef: 'BookGrid', description: 'Main grid' },
  ],
  breakpoints: ['1440'],
});

// ============================================================================
// Mock context
// ============================================================================

const createMockFs = (): FileSystem => ({
  readFile: () => Err({ code: 'INVALID_STATE' as const, message: 'mock fs', recoverable: false }),
  writeFile: () => Ok(undefined),
  writeFileAtomic: () => Ok(undefined),
  exists: () => false,
  mkdir: () => Ok(undefined),
  rename: () => Ok(undefined),
  remove: () => Ok(undefined),
  listDir: () => Ok([]),
  appendFile: () => Ok(undefined),
});

/** Minimal FS so planning/research can load disk-backed design-tokens.yaml (required since disk-only tokens). */
const createMockFsWithDesignTokens = (projectRoot: string): FileSystem => {
  const specDir = `${projectRoot}/agentforge/spec`;
  const tokensPath = `${specDir}/design-tokens.yaml`;
  const base = createMockFs();
  return {
    ...base,
    exists: (p: string) => p === specDir || p === tokensPath,
    readFile: (p: string) =>
      p === tokensPath ? Ok(stringify(BOOKSHELF_TOKENS)) : base.readFile(p),
  };
};

const createMockMCPClient = (): MCPClient => ({
  callTool: jest.fn().mockResolvedValue(Ok({})),
  listTools: async () => Ok([]),
  isAvailable: async () => true,
});

const createMockContext = (): AgentContext => ({
  taskId: 'smoke-001',
  projectRoot: '/tmp/agentforge-smoke',
  eventBus: createEventBus(),
  fs: createMockFs(),
  mcpClient: createMockMCPClient(),
  runGovernance: async () => Ok({ status: 'proceed' as const }),
  resolveProvider: () => Err({ code: 'MCP_UNAVAILABLE' as const, message: 'mock', recoverable: false }),
  recordAudit: () => {},
});

// ============================================================================
// Tests
// ============================================================================

describe('Pipeline wiring smoke test', () => {
  it('research stage receives full PRD content in its prompt', async () => {
    const { provider, calls } = createSpyProvider(CANNED_RESEARCH);
    const context = createMockContext();

    const input: UXDashboardResearchInput = {
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      prdRequirements: ['home', BOOKSHELF_PRD],
      designTokensSpec: BOOKSHELF_TOKENS,
    };

    await uxDashboardResearchWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(calls).toHaveLength(1);
    // The full PRD content must appear in the user message, not just "home"
    expect(calls[0].userContent).toContain('BookShelf');
    expect(calls[0].userContent).toContain('tracking books by ISBN');
    expect(calls[0].userContent).toContain('reading lists');
  });

  it('research stage receives design tokens in its prompt', async () => {
    const { provider, calls } = createSpyProvider(CANNED_RESEARCH);
    const context = createMockContext();

    const input: UXDashboardResearchInput = {
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      prdRequirements: ['home', BOOKSHELF_PRD],
      designTokensSpec: BOOKSHELF_TOKENS,
    };

    await uxDashboardResearchWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(calls[0].userContent).toContain('forest-green');
    expect(calls[0].userContent).toContain('#228B22');
    // Semantic token names must appear (previously lost by toDesignTokens flattening)
    expect(calls[0].userContent).toContain('background-primary');
    expect(calls[0].userContent).toContain('cta-primary');
  });

  it('planning stage receives research output in its prompt', async () => {
    const { provider, calls } = createSpyProvider(CANNED_PLANNING);
    const base = createMockContext();
    const context: AgentContext = {
      ...base,
      fs: createMockFsWithDesignTokens(base.projectRoot),
    };

    const researchOutput = JSON.parse(CANNED_RESEARCH);
    const input: UXDashboardPlanningInput = {
      briefId: researchOutput.briefId,
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      designBrief: researchOutput,
    };

    await uxDashboardPlanningWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(calls).toHaveLength(1);
    expect(calls[0].userContent).toContain('brief-smoke-001');
    expect(calls[0].userContent).toContain('book covers');
  });

  it('design stage receives project design system prompt', async () => {
    const { provider, calls } = createSpyProvider(CANNED_DESIGN);
    const context = createMockContext();

    const planningOutput = JSON.parse(CANNED_PLANNING);

    // Build design system prompt from spec — the path that was previously unwired
    const dsCtx = buildDesignSystemContextFromSpec(BOOKSHELF_TOKENS, BOOKSHELF_BRAND, planningOutput);

    const input: UXDashboardDesignInput = {
      specRef: planningOutput.specRef,
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      planningOutput,
      description: 'BookShelf home page',
      designSystemPrompt: dsCtx.designSystemPrompt,
    };

    await uxDashboardDesignWork(input, provider as unknown as LLMProviderRef, [], context);

    // At least 1 call for the main screen; may have additional for completeness follow-up
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // Design system prompt should contain brand and token info (in the first call)
    expect(calls[0].system).toContain('warm and bookish');
    expect(calls[0].system).toContain('AA');
    expect(calls[0].system).toContain('Project Design Tokens');
  });

  it('design stage without designSystemPrompt uses defaults and warns', async () => {
    const { provider, calls } = createSpyProvider(CANNED_DESIGN);
    const context = createMockContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const planningOutput = JSON.parse(CANNED_PLANNING);

    const input: UXDashboardDesignInput = {
      specRef: planningOutput.specRef,
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      planningOutput,
      description: 'BookShelf home page',
      // intentionally no designSystemPrompt
    };

    await uxDashboardDesignWork(input, provider as unknown as LLMProviderRef, [], context);

    // At least 1 call for the main screen; may have additional for completeness follow-up
    expect(calls.length).toBeGreaterThanOrEqual(1);
    // Should NOT contain project-specific design system content
    expect(calls[0].system).not.toContain('# Design System');
    // Should have warned
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no designSystemPrompt provided'),
    );

    warnSpy.mockRestore();
  });

  it('research stage rejects empty prdRequirements', async () => {
    const { provider } = createSpyProvider(CANNED_RESEARCH);
    const context = createMockContext();

    const input: UXDashboardResearchInput = {
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      prdRequirements: [],
    };

    const result = await uxDashboardResearchWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('prdRequirements');
    }
  });

  it('research stage warns when prdRequirements are too short', async () => {
    const { provider } = createSpyProvider(CANNED_RESEARCH);
    const context = createMockContext();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const input: UXDashboardResearchInput = {
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      prdRequirements: ['home'],
      designTokensSpec: BOOKSHELF_TOKENS,
    };

    await uxDashboardResearchWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('short labels'),
    );
    warnSpy.mockRestore();
  });

  it('design stage rejects missing componentTree', async () => {
    const { provider } = createSpyProvider(CANNED_DESIGN);
    const context = createMockContext();

    const input: UXDashboardDesignInput = {
      specRef: 'spec-001',
      moduleId: 'bookshelf-home',
      taskId: 'smoke-001',
      planningOutput: {
        specRef: 'spec-001',
        moduleId: 'bookshelf-home',
        componentTree: [],
        tokenBindings: {},
        responsiveRules: [],
        implementationStages: [],
      },
      description: 'test',
    };

    const result = await uxDashboardDesignWork(input, provider as unknown as LLMProviderRef, [], context);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('componentTree');
    }
  });
});
