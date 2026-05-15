/**
 * Tests for Node 5 — Task Planner.
 * Happy path, dry-Critic retry, precondition guards, prompt wiring, sizing post-processing.
 */

import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';
import type { CompletionResult, LLMProvider, ProviderError } from '@agentforge/providers';
import type {
  EnrichedRequirement,
  ConstraintSet,
  OptionsBundle,
  ArchitectureSpec,
  AssumptionLedger,
} from '@agentforge/core';
import { makeState, mockDeps, stubProvider } from '../../test-utils.js';
import {
  createTaskPlanner,
  buildTaskPlannerUserMessage,
  TASK_PLANNER_RESPONSE_SCHEMA,
  _resetTaskPlannerPromptCache,
} from './task-planner.js';

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
      usage: { inputTokens: 500, outputTokens: 1000 },
      cost: {
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        model: 'claude-opus-4-6',
        timestamp: new Date().toISOString(),
      },
      model: 'claude-opus-4-6',
      latencyMs: 50,
      finishReason: 'stop' as const,
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ENRICHED_REQ: EnrichedRequirement = {
  id: 'req-1',
  rawInput: 'Build CashPulse expense tracker',
  mode: 'bootstrap',
  prd: {
    id: 'prd-1',
    title: 'CashPulse',
    description: 'Personal expense tracking',
    status: 'draft',
    version: '1.0.0',
    features: [
      {
        id: 'f-expense-mgmt',
        name: 'Expense Management',
        description: 'CRUD for expenses',
        priority: 'must-have',
        acceptanceCriteria: [
          { id: 'ac-1', condition: 'When user submits expense form', behavior: 'expense is created', formatted: 'When user submits expense form, the system shall create expense' },
          { id: 'ac-2', condition: 'When user visits expense page', behavior: 'expenses are listed', formatted: 'When user visits expense page, the system shall list expenses' },
        ],
      },
      {
        id: 'f-categories',
        name: 'Categories',
        description: 'Expense categorization',
        priority: 'must-have',
        acceptanceCriteria: [
          { id: 'ac-3', condition: 'When user creates expense', behavior: 'can assign category', formatted: 'When user creates expense, the system shall allow category assignment' },
        ],
      },
    ],
    dataEntities: [
      { id: 'entity-expense', name: 'Expense', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'amount', type: 'number', required: true }] },
      { id: 'entity-category', name: 'Category', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'name', type: 'string', required: true }] },
    ],
    screens: [],
    nfrs: [],
    successMetrics: [],
    personas: [],
    outOfScope: [],
  },
  assumptionLedger: { id: 'al-1', entries: [], createdAt: '2026-01-01', lastUpdatedAt: '2026-01-01' },
  clarificationRounds: [],
  confidence: 0.9,
  createdAt: '2026-01-01',
};

const MOCK_CONSTRAINT_SET: ConstraintSet = { projectId: 'cashpulse', constraints: [], gaps: [], mode: 'greenfield' };
const MOCK_OPTIONS_BUNDLE: OptionsBundle = { projectId: 'cashpulse', memos: [] };
const MOCK_ARCH_SPEC: ArchitectureSpec = {
  projectId: 'cashpulse',
  decisions: [{ gapId: 'gap-orm', chosenAlternativeId: 'alt-drizzle', rationale: 'Type-safe' }],
  stackConfig: { frontend: 'react', backend: 'node', database: 'postgres', styling: 'tailwind' },
  assumptionLedgerUpdates: [],
  implementationPatterns: [
    { id: 'data-access-drizzle-only', category: 'data-access', title: 'Drizzle', rule: 'Use Drizzle' },
    { id: 'validation-zod-at-boundary', category: 'validation', title: 'Zod', rule: 'Zod at boundary' },
  ],
};
const MOCK_ASSUMPTION_LEDGER: AssumptionLedger = { id: 'al-1', entries: [], createdAt: '2026-01-01', lastUpdatedAt: '2026-01-01' };

const VALID_TASK_PLAN = {
  projectId: 'cashpulse',
  tasks: [
    {
      id: 'task-scaffold',
      title: 'Project scaffold',
      description: 'Initialize project structure with Drizzle, Next.js, and Tailwind.',
      filePaths: ['package.json', 'drizzle.config.ts'],
      dependencies: [],
      writeOrder: 0,
      type: 'scaffold',
      mode: 'NEW',
      estimatedTokenBudget: 8000,
      contextRefs: [{ kind: 'pattern', id: 'data-access-drizzle-only' }],
      patternRefs: ['data-access-drizzle-only'],
      acceptanceCriteriaIds: [],
    },
    {
      id: 'task-expense-api',
      title: 'Expense CRUD API',
      description: 'Implement expense REST endpoints with Drizzle queries.',
      filePaths: ['src/api/expenses/route.ts', 'src/db/schema/expense.ts'],
      dependencies: ['task-scaffold'],
      writeOrder: 1,
      type: 'backend',
      mode: 'NEW',
      estimatedTokenBudget: 25000,
      contextRefs: [
        { kind: 'dataModel.entity', id: 'entity-expense' },
        { kind: 'pattern', id: 'data-access-drizzle-only' },
        { kind: 'pattern', id: 'validation-zod-at-boundary' },
      ],
      patternRefs: ['data-access-drizzle-only', 'validation-zod-at-boundary'],
      acceptanceCriteriaIds: ['ac-1', 'ac-2'],
    },
    {
      id: 'task-category-api',
      title: 'Category API',
      description: 'Implement category endpoints and expense-category relationship.',
      filePaths: ['src/api/categories/route.ts', 'src/db/schema/category.ts'],
      dependencies: ['task-scaffold'],
      writeOrder: 1,
      type: 'backend',
      mode: 'NEW',
      estimatedTokenBudget: 20000,
      contextRefs: [
        { kind: 'dataModel.entity', id: 'entity-category' },
        { kind: 'pattern', id: 'data-access-drizzle-only' },
      ],
      patternRefs: ['data-access-drizzle-only'],
      acceptanceCriteriaIds: ['ac-3'],
    },
  ],
  featureCoverage: {
    'f-expense-mgmt': ['task-expense-api'],
    'f-categories': ['task-category-api'],
  },
};

function makeFullState() {
  return makeState({
    enrichedRequirement: MOCK_ENRICHED_REQ,
    constraintSet: MOCK_CONSTRAINT_SET,
    optionsBundle: MOCK_OPTIONS_BUNDLE,
    architectureSpec: MOCK_ARCH_SPEC,
    assumptionLedger: MOCK_ASSUMPTION_LEDGER,
    dataModelSpec: {
      projectId: 'cashpulse',
      entities: [
        { id: 'entity-expense', name: 'Expense', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'amount', type: 'number', required: true }] },
        { id: 'entity-category', name: 'Category', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'name', type: 'string', required: true }] },
      ],
    },
    apiChangeSets: [{
      id: 'api-expenses', changeRequestId: 'cr-1',
      additions: [{ method: 'GET', path: '/api/expenses', description: 'List', breaking: false }],
      modifications: [], removals: [],
    }],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createTaskPlanner (Node 5)', () => {
  beforeEach(() => {
    _resetTaskPlannerPromptCache();
  });

  it('returns {} when architectureSpec is missing', async () => {
    const node = createTaskPlanner(mockDeps);
    const result = await node(makeState({ enrichedRequirement: MOCK_ENRICHED_REQ }));
    expect(result).toEqual({});
  });

  it('returns {} when enrichedRequirement is missing', async () => {
    const node = createTaskPlanner(mockDeps);
    const result = await node(makeState({ architectureSpec: MOCK_ARCH_SPEC }));
    expect(result).toEqual({});
  });

  it('returns {} when provider returns Err', async () => {
    const complete = jest.fn().mockResolvedValue(
      Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'unavailable' }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());
    expect(result).toEqual({});
  });

  it('returns {} when response content is not valid JSON and structured is absent', async () => {
    const complete = jest.fn().mockResolvedValue({
      ok: true as const,
      value: {
        content: '<<< not-json >>>',
        structured: undefined,
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 2 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'claude-opus-4-6', timestamp: new Date().toISOString() },
        model: 'claude-opus-4-6',
        latencyMs: 1,
        finishReason: 'stop' as const,
      },
    } satisfies Result<CompletionResult, ProviderError>);
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());
    expect(result).toEqual({});
  });

  it('returns {} when structured payload fails Zod validation', async () => {
    const complete = jest.fn().mockImplementation(async () =>
      okStructured({ projectId: 'p', tasks: 'not-array', featureCoverage: {} }),
    );
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());
    expect(result).toEqual({});
  });

  it('greenfield happy path: produces TaskPlan with post-processed token budgets', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_TASK_PLAN));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    expect(result.taskPlan).toBeDefined();
    expect(result.taskPlan!.projectId).toBe('cashpulse');
    expect(result.taskPlan!.tasks).toHaveLength(3);

    // Token budgets are post-processed by sizing heuristic (not the LLM's raw values)
    for (const task of result.taskPlan!.tasks) {
      expect(task.estimatedTokenBudget).toBeGreaterThan(0);
      expect(task.estimatedTokenBudget).toBeLessThanOrEqual(120_000);
    }

    // Feature coverage maps features to tasks
    expect(result.taskPlan!.featureCoverage['f-expense-mgmt']).toContain('task-expense-api');
    expect(result.taskPlan!.featureCoverage['f-categories']).toContain('task-category-api');
  });

  it('calls LLM with claude-opus-4-6 and TASK_PLANNER_RESPONSE_SCHEMA', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_TASK_PLAN));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    await createTaskPlanner(deps)(makeFullState());

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      }),
      expect.objectContaining({
        model: 'claude-opus-4-6',
        responseSchema: TASK_PLANNER_RESPONSE_SCHEMA,
      }),
    );
  });

  it('dry-Critic: retries once when gates 10-14 fail, then emits retry result', async () => {
    const planWithBadPatternRef = {
      ...VALID_TASK_PLAN,
      tasks: VALID_TASK_PLAN.tasks.map((t) => ({
        ...t,
        patternRefs: [...t.patternRefs, 'nonexistent-pattern'],
      })),
    };
    const fixedPlan = { ...VALID_TASK_PLAN };

    let callCount = 0;
    const complete = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return okStructured(planWithBadPatternRef);
      return okStructured(fixedPlan);
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    // Should have called LLM twice (initial + retry)
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.taskPlan).toBeDefined();
    expect(result.taskPlan!.tasks).toHaveLength(3);
  });

  it('dry-Critic: emits first attempt if retry LLM call fails', async () => {
    const planWithBadPatternRef = {
      ...VALID_TASK_PLAN,
      tasks: VALID_TASK_PLAN.tasks.map((t) => ({
        ...t,
        patternRefs: [...t.patternRefs, 'nonexistent-pattern'],
      })),
    };

    let callCount = 0;
    const complete = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return okStructured(planWithBadPatternRef);
      return Err<ProviderError>({ code: 'PROVIDER_DOWN', status: 503, message: 'retry failed' });
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    // Should still return the first (imperfect) plan
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.taskPlan).toBeDefined();
  });

  it('each task has required R2/R3 fields populated', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_TASK_PLAN));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    for (const task of result.taskPlan!.tasks) {
      expect(task.mode).toMatch(/^(NEW|MODIFY)$/);
      expect(typeof task.estimatedTokenBudget).toBe('number');
      expect(Array.isArray(task.contextRefs)).toBe(true);
      expect(Array.isArray(task.patternRefs)).toBe(true);
      expect(Array.isArray(task.acceptanceCriteriaIds)).toBe(true);
    }
  });

  it('dry-Critic retry injects failure feedback into user message', async () => {
    const planWithBadRef = {
      ...VALID_TASK_PLAN,
      tasks: VALID_TASK_PLAN.tasks.map((t) => ({
        ...t,
        contextRefs: [...t.contextRefs, { kind: 'dataModel.entity' as const, id: 'nonexistent-entity' }],
      })),
    };

    let callCount = 0;
    const capturedMessages: string[] = [];
    const complete = jest.fn().mockImplementation(async (prompt: { readonly messages: readonly { content: string }[] }) => {
      callCount++;
      capturedMessages.push(prompt.messages[0]!.content);
      // First call returns plan that fails dry-critic, retry returns valid plan
      if (callCount === 1) return okStructured(planWithBadRef);
      return okStructured(VALID_TASK_PLAN);
    });
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    await createTaskPlanner(deps)(makeFullState());

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[1]).toContain('Dry-Critic Feedback');
    expect(capturedMessages[1]).toContain('contextRef-resolution');
  });

  it('CashPulse golden fixture: all tasks pass dry-Critic gates 10-14 (no retry)', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_TASK_PLAN));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    // Dry-Critic passed on first attempt — only 1 LLM call
    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.taskPlan).toBeDefined();
    expect(result.taskPlan!.tasks).toHaveLength(3);
  });

  it('acceptance-criteria coverage: every EARS criterion referenced by at least one task', async () => {
    const complete = jest.fn().mockImplementation(async () => okStructured(VALID_TASK_PLAN));
    const deps = { ...mockDeps, provider: { ...stubProvider, complete } as LLMProvider };
    const result = await createTaskPlanner(deps)(makeFullState());

    const allCriteriaIds = result.taskPlan!.tasks.flatMap((t) => t.acceptanceCriteriaIds);
    expect(allCriteriaIds).toContain('ac-1');
    expect(allCriteriaIds).toContain('ac-2');
    expect(allCriteriaIds).toContain('ac-3');
  });
});

describe('buildTaskPlannerUserMessage', () => {
  it('includes PRD features and acceptance criteria', () => {
    const msg = buildTaskPlannerUserMessage(makeFullState());
    expect(msg).toContain('f-expense-mgmt');
    expect(msg).toContain('Expense Management');
    expect(msg).toContain('ac-1');
    expect(msg).toContain('When user submits expense form, the system shall create expense');
  });

  it('includes architecture spec decisions and patterns', () => {
    const msg = buildTaskPlannerUserMessage(makeFullState());
    expect(msg).toContain('gap-orm');
    expect(msg).toContain('data-access-drizzle-only');
  });

  it('includes data model entities', () => {
    const msg = buildTaskPlannerUserMessage(makeFullState());
    expect(msg).toContain('entity-expense');
    expect(msg).toContain('Expense');
  });

  it('includes API change sets', () => {
    const msg = buildTaskPlannerUserMessage(makeFullState());
    expect(msg).toContain('api-expenses');
    expect(msg).toContain('GET');
    expect(msg).toContain('/api/expenses');
  });

  it('includes change classification in brownfield mode', () => {
    const state = makeFullState();
    const brownfieldState = {
      ...state,
      mode: 'brownfield' as const,
      changeClassification: {
        id: 'cc-1',
        changeRequestId: 'cr-1',
        scopeAxes: ['api' as const],
        blastRadius: 'medium' as const,
        affectedModules: ['packages/api'],
        confidence: 0.88,
      },
    };
    const msg = buildTaskPlannerUserMessage(brownfieldState);
    expect(msg).toContain('Change Classification');
    expect(msg).toContain('scopeAxes');
  });

  it('includes project mode', () => {
    const msg = buildTaskPlannerUserMessage(makeFullState());
    expect(msg).toContain('greenfield');
  });
});
