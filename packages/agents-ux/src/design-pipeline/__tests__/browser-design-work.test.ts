import { browserDesignWork, buildBrowserDesignUserMessage } from '../browser-design-work.js';
import type { DesignPhaseState, NodeContext, PipelineStageError } from '../types.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { createRealFs } from '@agentforge/core';
import type { DesignSpecV2, CatalogMap } from '@agentforge/designspec-renderer';

// ── Helpers ──

const VALID_TOOL_RESPONSE = {
  screen: 'test-page',
  width: 1440,
  nodes: {
    root: { type: 'frame', parent: null, order: 0, label: 'Root' },
    header: { type: 'frame', parent: 'root', order: 0, label: 'Header' },
  },
};

const EMPTY_TOOL_RESPONSE = {
  screen: 'test-page',
  width: 1440,
  nodes: {},
};

function makeCompletion(toolArgs: Record<string, unknown>, finishReason = 'tool_use') {
  return {
    ok: true,
    value: {
      content: '',
      toolCalls: [{ id: 'tc-1', name: 'submit_design', args: toolArgs }],
      usage: { inputTokens: 1000, outputTokens: 2000 },
      cost: { totalCostUsd: 0.05, inputCostUsd: 0.02, outputCostUsd: 0.03 },
      finishReason,
      latencyMs: 3000,
    },
  };
}

function createMockProvider(...responses: unknown[]): LLMProviderRef {
  const completeFn = jest.fn();
  for (const resp of responses) {
    completeFn.mockResolvedValueOnce(resp);
  }
  return {
    name: 'test-provider',
    complete: completeFn,
    stream: jest.fn(),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, inputTokens: 0, outputTokens: 0 }),
  };
}

function createNodeContext(provider: LLMProviderRef): NodeContext {
  return {
    provider,
    agentContext: {
      taskId: 'task-1',
      projectRoot: '/tmp/test-project',
      eventBus: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), once: jest.fn() } as unknown as AgentContext['eventBus'],
      fs: createRealFs(),
      runGovernance: jest.fn().mockResolvedValue({ outcome: 'proceed' }),
      resolveProvider: jest.fn().mockReturnValue({ ok: true, value: provider }),
      recordAudit: jest.fn(),
      resolvedModel: 'claude-sonnet-4-6',
    },
  };
}

function createState(overrides?: Partial<DesignPhaseState>): DesignPhaseState {
  return {
    moduleId: 'test-page',
    taskId: 'task-1',
    projectRoot: '/tmp/test-project',
    designTool: 'browser',
    description: 'A dashboard for tracking expenses',
    prdRequirements: ['Build a dashboard with user analytics'],
    planning: {
      specRef: 'test-page',
      moduleId: 'test-page',
      componentTree: [],
      tokenBindings: {},
      responsiveRules: [],
    },
    ...overrides,
  };
}

// ── Tests ──

describe('browserDesignWork', () => {
  it('returns design output with valid tool response', async () => {
    const provider = createMockProvider(makeCompletion(VALID_TOOL_RESPONSE));
    const ctx = createNodeContext(provider);
    const state = createState();

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.design).toBeDefined();
      expect(result.value.design!.designToolMetadata?.tool).toBe('browser');
    }
  });

  it('retries once on empty nodes then succeeds', async () => {
    const provider = createMockProvider(
      makeCompletion(EMPTY_TOOL_RESPONSE),
      makeCompletion(VALID_TOOL_RESPONSE),
    );
    const ctx = createNodeContext(provider);
    const state = createState();

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(true);
    expect(provider.complete).toHaveBeenCalledTimes(2);
  });

  it('fails after exhausting retries on empty nodes', async () => {
    const provider = createMockProvider(
      makeCompletion(EMPTY_TOOL_RESPONSE),
      makeCompletion(EMPTY_TOOL_RESPONSE),
    );
    const ctx = createNodeContext(provider);
    const state = createState();

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).message).toContain('no nodes');
    }
  });

  it('fails on max_tokens truncation', async () => {
    const provider = createMockProvider(makeCompletion(VALID_TOOL_RESPONSE, 'max_tokens'));
    const ctx = createNodeContext(provider);
    const state = createState();

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).message).toContain('truncated');
    }
  });

  it('fails on LLM API error', async () => {
    const provider = createMockProvider({
      ok: false,
      error: { code: 'API_ERROR', message: 'Rate limited' },
    });
    const ctx = createNodeContext(provider);
    const state = createState();

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect((result.error as PipelineStageError).stage).toBe('design');
    }
  });

  it('sets screen to __chrome__ when chromePass mode is generate', async () => {
    const provider = createMockProvider(makeCompletion(VALID_TOOL_RESPONSE));
    const ctx = createNodeContext(provider);
    const state = createState({
      chromePass: { mode: 'generate' },
    });

    const result = await browserDesignWork(state, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const spec = result.value.design!.spec as unknown as { screen: string };
      expect(spec.screen).toBe('__chrome__');
    }
  });
});

describe('buildBrowserDesignUserMessage', () => {
  it('includes moduleId', () => {
    const state = createState();
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Module ID: test-page');
  });

  it('includes viewport width when set', () => {
    const state = createState({ viewportWidth: 1024 });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Viewport Width: 1024px');
    expect(msg).toContain('root page node MUST have width: 1024');
  });

  it('includes chrome-only instructions when mode is generate', () => {
    const state = createState({
      chromePass: { mode: 'generate' },
      description: 'Test app',
    });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('chrome-only pass');
    expect(msg).toContain('regions');
  });

  it('includes frozen chrome node IDs when mode is consume', () => {
    const frozenSpec = {
      screen: '__chrome__',
      width: 1440,
      nodes: {
        'nav-header': { type: 'frame' as const, parent: null, order: 0 },
        'tab-bar': { type: 'frame' as const, parent: null, order: 1 },
      },
    } as unknown as DesignSpecV2;

    const state = createState({
      chromePass: { mode: 'consume', spec: frozenSpec, activePageId: 'dashboard' },
    });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Frozen shared chrome');
    expect(msg).toContain('nav-header');
    expect(msg).toContain('tab-bar');
    expect(msg).toContain('dashboard');
  });

  it('does NOT include chrome instructions when chromePass is undefined', () => {
    const state = createState({ chromePass: undefined });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).not.toContain('chrome-only pass');
    expect(msg).not.toContain('Frozen shared chrome');
  });

  it('includes navigation propagation instructions', () => {
    const state = createState();
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Navigation Propagation (REQUIRED)');
    expect(msg).toContain('NavigationBar Flattening Example');
  });

  it('includes screen type when not page', () => {
    const state = createState({
      pageContext: {
        targetPage: { id: 'modal-1', name: 'Add Item', description: 'Add a new item', route: '/add', screen_type: 'modal', components: [], data_sources: [], status: 'planned' as const },
        allPages: [],
      },
    });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Screen Type: modal');
    expect(msg).toContain('screenType: "modal"');
  });

  it('includes planning output as JSON', () => {
    const state = createState();
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Planning Output:');
    expect(msg).toContain('"specRef"');
  });

  it('excludes catalog mapping guide when catalogMap is undefined', () => {
    const state = createState({ catalogMap: undefined });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).not.toContain('Catalog Mapping Guide');
  });

  it('includes catalog mapping guide when catalogMap is provided', () => {
    const state = createState({
      catalogMap: { Section: { variants: {} } } as unknown as CatalogMap,
    });
    const msg = buildBrowserDesignUserMessage(state);
    expect(msg).toContain('Catalog Mapping Guide');
    expect(msg).toContain('catalog: "Section"');
    expect(msg).toContain('catalog: "Form"');
    expect(msg).toContain('catalog: "PageHeader"');
    expect(msg).toContain('ONLY for pure layout wrappers');
  });
});
