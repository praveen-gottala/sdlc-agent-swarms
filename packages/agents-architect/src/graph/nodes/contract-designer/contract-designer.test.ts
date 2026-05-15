/**
 * Tests for Node 4 — Contract Designer (5 sequential specialists + brownfield gating).
 * Covers: each specialist happy/error path, brownfield scope filtering,
 * sequential dispatch, user message wiring (upstream data in prompts).
 */

import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';
import type { CompletionResult, LLMProvider, ProviderError } from '@agentforge/providers';
import { makeState, mockDeps, stubProvider } from '../../../test-utils.js';
import { createContractDesigner, selectSpecialists } from './index.js';
import {
  createDataModelSpecialist,
  buildDataModelUserMessage,
  _resetDataModelPromptCache,
} from './data-model.js';
import {
  createApiSpecialist,
  buildApiUserMessage,
  _resetApiPromptCache,
} from './api.js';
import {
  createComponentsSpecialist,
  buildComponentsUserMessage,
  _resetComponentsPromptCache,
} from './components.js';
import {
  createScreensSpecialist,
  buildScreensUserMessage,
  _resetScreensPromptCache,
} from './screens.js';
import {
  createDesignSystemDiffSpecialist,
  buildDesignSystemDiffUserMessage,
  _resetDesignSystemDiffPromptCache,
} from './design-system-diff.js';

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    debugLog: jest.fn(),
  };
});

function okStructured(data: Record<string, unknown>): Result<CompletionResult, ProviderError> {
  return {
    ok: true as const,
    value: {
      content: JSON.stringify(data),
      structured: data,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 200 },
      cost: {
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        model: 'claude-sonnet-4-6',
        timestamp: new Date().toISOString(),
      },
      model: 'claude-sonnet-4-6',
      latencyMs: 10,
      finishReason: 'stop' as const,
    },
  };
}

const ARCH_SPEC = {
  projectId: 'cashpulse',
  decisions: [{ gapId: 'gap-orm', chosenAlternativeId: 'alt-drizzle', rationale: 'SQL-first' }],
  stackConfig: { frontend: 'react', backend: 'node', database: 'postgres', styling: 'tailwind' },
  assumptionLedgerUpdates: [],
  implementationPatterns: [
    { id: 'data-access-drizzle-only', category: 'data-access', title: 'Drizzle ORM', rule: 'Use Drizzle' },
    { id: 'component-tailwind-tokens-only', category: 'styling', title: 'Token discipline', rule: 'Use tokens only' },
  ],
};

const DATA_MODEL_OUTPUT = {
  projectId: 'cashpulse',
  entities: [
    {
      id: 'entity-expense',
      name: 'Expense',
      fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'amount', type: 'decimal(10,2)', required: true },
      ],
      tableName: 'expenses',
      relationships: ['userId: uuid fk->User'],
    },
  ],
};

const API_OUTPUT = {
  apiChangeSets: [
    {
      id: 'api-expenses',
      changeRequestId: 'cr-1',
      additions: [{ method: 'GET', path: '/api/expenses', description: 'List expenses', breaking: false }],
      modifications: [],
      removals: [],
    },
  ],
};

const COMPONENTS_OUTPUT = {
  compositions: [
    {
      screenId: 'screen-dashboard',
      componentTree: [
        { id: 'ct-1', type: 'BudgetSummaryCard', props: { budget: 'Budget' } },
      ],
    },
  ],
};

const SCREENS_OUTPUT = {
  screenPlans: [
    {
      id: 'screen-dashboard',
      featureId: 'f-1',
      screenType: 'page' as const,
      route: '/dashboard',
      components: ['BudgetSummaryCard'],
      dataBindings: [{ entityId: 'entity-expense', field: 'amount', source: '/api/expenses' }],
      navigationTargets: [{ target: 'screen-expenses', trigger: 'click' }],
    },
  ],
};

const DESIGN_SYSTEM_DIFF_OUTPUT = {
  addedTokens: ['color.budget.warning', 'space.card.padding'],
  modifiedTokens: [],
  removedTokens: [],
  themeStrategy: 'light-dark',
};

// ---------------------------------------------------------------------------
// Individual specialist tests
// ---------------------------------------------------------------------------

describe('createDataModelSpecialist (Node 4.1)', () => {
  beforeEach(() => _resetDataModelPromptCache());

  it('returns {} when no architectureSpec', async () => {
    const out = await createDataModelSpecialist(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('returns {} on provider error', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createDataModelSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('returns {} on invalid JSON', async () => {
    const complete = jest.fn().mockResolvedValue({
      ok: true as const,
      value: {
        content: 'not json',
        structured: undefined,
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 2 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
        model: 'claude-sonnet-4-6',
        latencyMs: 1,
        finishReason: 'stop' as const,
      },
    } satisfies Result<CompletionResult, ProviderError>);
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createDataModelSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('happy path: returns DataModelSpec', async () => {
    const complete = jest.fn().mockResolvedValue(okStructured(DATA_MODEL_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createDataModelSpecialist(deps)(
      makeState({ architectureSpec: ARCH_SPEC }),
    );
    expect(out.dataModelSpec).toBeDefined();
    expect(out.dataModelSpec!.entities).toHaveLength(1);
    expect(out.dataModelSpec!.entities[0]!.id).toBe('entity-expense');
    expect(complete).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });
});

describe('createApiSpecialist (Node 4.2)', () => {
  beforeEach(() => _resetApiPromptCache());

  it('returns {} when no architectureSpec', async () => {
    const out = await createApiSpecialist(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('returns {} on provider error', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createApiSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('happy path: returns apiChangeSets', async () => {
    const complete = jest.fn().mockResolvedValue(okStructured(API_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createApiSpecialist(deps)(
      makeState({ architectureSpec: ARCH_SPEC, dataModelSpec: DATA_MODEL_OUTPUT }),
    );
    expect(out.apiChangeSets).toHaveLength(1);
    expect(out.apiChangeSets![0]!.id).toBe('api-expenses');
  });
});

describe('createComponentsSpecialist (Node 4.3)', () => {
  beforeEach(() => _resetComponentsPromptCache());

  it('returns {} when no architectureSpec', async () => {
    const out = await createComponentsSpecialist(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('returns {} on provider error', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createComponentsSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('happy path: returns componentCompositions', async () => {
    const complete = jest.fn().mockResolvedValue(okStructured(COMPONENTS_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createComponentsSpecialist(deps)(
      makeState({
        architectureSpec: ARCH_SPEC,
        dataModelSpec: DATA_MODEL_OUTPUT,
        apiChangeSets: API_OUTPUT.apiChangeSets,
      }),
    );
    expect(out.componentCompositions).toHaveLength(1);
    expect(out.componentCompositions![0]!.screenId).toBe('screen-dashboard');
  });
});

describe('createScreensSpecialist (Node 4.4)', () => {
  beforeEach(() => _resetScreensPromptCache());

  it('returns {} when no architectureSpec', async () => {
    const out = await createScreensSpecialist(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('returns {} on provider error', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createScreensSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('happy path: returns screenPlans', async () => {
    const complete = jest.fn().mockResolvedValue(okStructured(SCREENS_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createScreensSpecialist(deps)(
      makeState({
        architectureSpec: ARCH_SPEC,
        dataModelSpec: DATA_MODEL_OUTPUT,
        apiChangeSets: API_OUTPUT.apiChangeSets,
        componentCompositions: COMPONENTS_OUTPUT.compositions,
      }),
    );
    expect(out.screenPlans).toHaveLength(1);
    expect(out.screenPlans![0]!.id).toBe('screen-dashboard');
  });
});

describe('createDesignSystemDiffSpecialist (Node 4.5)', () => {
  beforeEach(() => _resetDesignSystemDiffPromptCache());

  it('returns {} when no architectureSpec', async () => {
    const out = await createDesignSystemDiffSpecialist(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('returns {} on provider error', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createDesignSystemDiffSpecialist(deps)(makeState({ architectureSpec: ARCH_SPEC }));
    expect(out).toEqual({});
  });

  it('happy path: returns designSystemDiff', async () => {
    const complete = jest.fn().mockResolvedValue(okStructured(DESIGN_SYSTEM_DIFF_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const out = await createDesignSystemDiffSpecialist(deps)(
      makeState({
        architectureSpec: ARCH_SPEC,
        componentCompositions: COMPONENTS_OUTPUT.compositions,
        screenPlans: SCREENS_OUTPUT.screenPlans,
      }),
    );
    expect(out.designSystemDiff).toBeDefined();
    expect(out.designSystemDiff!.addedTokens).toContain('color.budget.warning');
  });
});

// ---------------------------------------------------------------------------
// User message wiring tests
// ---------------------------------------------------------------------------

describe('user message wiring', () => {
  it('data-model user message includes architecture decisions', () => {
    const msg = buildDataModelUserMessage(makeState({ architectureSpec: ARCH_SPEC }));
    expect(msg).toContain('gap-orm');
    expect(msg).toContain('alt-drizzle');
    expect(msg).toContain('postgres');
  });

  it('api user message includes data model from Node 4.1', () => {
    const msg = buildApiUserMessage(
      makeState({ architectureSpec: ARCH_SPEC, dataModelSpec: DATA_MODEL_OUTPUT }),
    );
    expect(msg).toContain('Data model (from Node 4.1)');
    expect(msg).toContain('entity-expense');
    expect(msg).toContain('expenses');
  });

  it('components user message includes data model and api sets', () => {
    const msg = buildComponentsUserMessage(
      makeState({
        architectureSpec: ARCH_SPEC,
        dataModelSpec: DATA_MODEL_OUTPUT,
        apiChangeSets: API_OUTPUT.apiChangeSets,
      }),
    );
    expect(msg).toContain('Data model (from Node 4.1)');
    expect(msg).toContain('API change sets (from Node 4.2)');
    expect(msg).toContain('entity-expense');
    expect(msg).toContain('/api/expenses');
  });

  it('components user message includes implementation patterns', () => {
    const msg = buildComponentsUserMessage(makeState({ architectureSpec: ARCH_SPEC }));
    expect(msg).toContain('Implementation patterns');
    expect(msg).toContain('data-access-drizzle-only');
  });

  it('screens user message includes component compositions from Node 4.3', () => {
    const msg = buildScreensUserMessage(
      makeState({
        architectureSpec: ARCH_SPEC,
        componentCompositions: COMPONENTS_OUTPUT.compositions,
      }),
    );
    expect(msg).toContain('Component compositions (from Node 4.3)');
    expect(msg).toContain('screen-dashboard');
    expect(msg).toContain('BudgetSummaryCard');
  });

  it('design-system-diff user message includes deps.designSystemContext when present', () => {
    const deps = {
      ...mockDeps,
      designSystemContext: {
        designSystemPrompt: 'Base tokens: primary=#2196F3',
        colorPalette: [],
        shadeScales: {},
        componentTree: [],
        tokenBindings: {},
        typographyScale: [],
        spacingScale: [],
      },
    };
    const msg = buildDesignSystemDiffUserMessage(
      makeState({ architectureSpec: ARCH_SPEC }),
      deps,
    );
    expect(msg).toContain('Existing design system context');
    expect(msg).toContain('primary=#2196F3');
  });

  it('data-model user message includes change classification in brownfield', () => {
    const msg = buildDataModelUserMessage(
      makeState({
        mode: 'brownfield',
        architectureSpec: ARCH_SPEC,
        changeClassification: {
          id: 'cc-1',
          changeRequestId: 'cr-1',
          scopeAxes: ['data-model', 'api'],
          blastRadius: 'medium',
          affectedModules: ['packages/db'],
          confidence: 0.9,
        },
      }),
    );
    expect(msg).toContain('Change classification');
    expect(msg).toContain('data-model');
    expect(msg).toContain('packages/db');
  });
});

// ---------------------------------------------------------------------------
// Brownfield scope filtering
// ---------------------------------------------------------------------------

describe('selectSpecialists', () => {
  it('returns all 5 specialists when scopeAxes is undefined (greenfield)', () => {
    const selected = selectSpecialists(undefined);
    expect(selected).toHaveLength(5);
  });

  it('returns only data-model + api specialists for scopeAxes=[data-model, api]', () => {
    const selected = selectSpecialists(['data-model', 'api']);
    expect(selected).toHaveLength(2);
    expect(selected.map((s) => s.name)).toEqual(['data-model', 'api']);
  });

  it('returns only ui specialist for scopeAxes=[ui]', () => {
    const selected = selectSpecialists(['ui']);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.name).toBe('screens');
  });

  it('returns only design-system specialist for scopeAxes=[design-system]', () => {
    const selected = selectSpecialists(['design-system']);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.name).toBe('design-system-diff');
  });
});

// ---------------------------------------------------------------------------
// Integration: sequential dispatch
// ---------------------------------------------------------------------------

describe('createContractDesigner (Node 4 — sequential dispatch)', () => {
  beforeEach(() => {
    _resetDataModelPromptCache();
    _resetApiPromptCache();
    _resetComponentsPromptCache();
    _resetScreensPromptCache();
    _resetDesignSystemDiffPromptCache();
  });

  it('returns {} when no architectureSpec', async () => {
    const out = await createContractDesigner(mockDeps)(makeState());
    expect(out).toEqual({});
  });

  it('greenfield: all 5 specialists produce output', async () => {
    let callIndex = 0;
    const responses = [
      okStructured(DATA_MODEL_OUTPUT),
      okStructured(API_OUTPUT),
      okStructured(COMPONENTS_OUTPUT),
      okStructured(SCREENS_OUTPUT),
      okStructured(DESIGN_SYSTEM_DIFF_OUTPUT),
    ];
    const complete = jest.fn().mockImplementation(async () => {
      const resp = responses[callIndex];
      callIndex++;
      return resp;
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };

    const out = await createContractDesigner(deps)(
      makeState({ architectureSpec: ARCH_SPEC }),
    );

    expect(complete).toHaveBeenCalledTimes(5);
    expect(out.dataModelSpec).toBeDefined();
    expect(out.apiChangeSets).toHaveLength(1);
    expect(out.componentCompositions).toHaveLength(1);
    expect(out.screenPlans).toHaveLength(1);
    expect(out.designSystemDiff).toBeDefined();
  });

  it('brownfield: only scoped specialists run', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(DATA_MODEL_OUTPUT));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };

    const out = await createContractDesigner(deps)(
      makeState({
        architectureSpec: ARCH_SPEC,
        changeClassification: {
          id: 'cc-1',
          changeRequestId: 'cr-1',
          scopeAxes: ['data-model'],
          blastRadius: 'low',
          affectedModules: ['packages/db'],
          confidence: 0.95,
        },
      }),
    );

    expect(complete).toHaveBeenCalledTimes(1);
    expect(out.dataModelSpec).toBeDefined();
    expect(out.apiChangeSets).toBeUndefined();
    expect(out.componentCompositions).toBeUndefined();
    expect(out.screenPlans).toBeUndefined();
    expect(out.designSystemDiff).toBeUndefined();
  });

  it('sequential: api specialist receives data model from prior specialist', async () => {
    const captured: string[] = [];
    let callIndex = 0;
    const responses = [
      okStructured(DATA_MODEL_OUTPUT),
      okStructured(API_OUTPUT),
      okStructured(COMPONENTS_OUTPUT),
      okStructured(SCREENS_OUTPUT),
      okStructured(DESIGN_SYSTEM_DIFF_OUTPUT),
    ];
    const complete = jest.fn().mockImplementation(
      async (prompt: { readonly messages: readonly { content: string }[] }) => {
        captured.push(prompt.messages[0]!.content);
        const resp = responses[callIndex];
        callIndex++;
        return resp;
      },
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };

    await createContractDesigner(deps)(
      makeState({ architectureSpec: ARCH_SPEC }),
    );

    // 2nd call (api) should see data model from 1st call
    expect(captured[1]).toContain('entity-expense');
    expect(captured[1]).toContain('Data model (from Node 4.1)');
    // 3rd call (components) should see data model + api
    expect(captured[2]).toContain('entity-expense');
    expect(captured[2]).toContain('/api/expenses');
    // 4th call (screens) should see components
    expect(captured[3]).toContain('screen-dashboard');
    expect(captured[3]).toContain('BudgetSummaryCard');
  });

  it('specialist failure does not block subsequent specialists', async () => {
    let callIndex = 0;
    const responses = [
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'down' }),
      okStructured(API_OUTPUT),
      okStructured(COMPONENTS_OUTPUT),
      okStructured(SCREENS_OUTPUT),
      okStructured(DESIGN_SYSTEM_DIFF_OUTPUT),
    ];
    const complete = jest.fn().mockImplementation(async () => {
      const resp = responses[callIndex];
      callIndex++;
      return resp;
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };

    const out = await createContractDesigner(deps)(
      makeState({ architectureSpec: ARCH_SPEC }),
    );

    expect(complete).toHaveBeenCalledTimes(5);
    expect(out.dataModelSpec).toBeUndefined();
    expect(out.apiChangeSets).toHaveLength(1);
    expect(out.componentCompositions).toHaveLength(1);
    expect(out.screenPlans).toHaveLength(1);
    expect(out.designSystemDiff).toBeDefined();
  });
});
