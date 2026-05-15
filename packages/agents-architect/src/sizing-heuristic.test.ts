/**
 * Tests for estimateTaskTokenBudget — R3 §3-4 token budget sizing.
 */

import type { ContractBundle, TaskNode } from '@agentforge/core';
import { TASK_TOKEN_BUDGET_CEILING } from '@agentforge/core';
import { estimateTaskTokenBudget } from './sizing-heuristic.js';

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    debugLog: jest.fn(),
  };
});

const BASE_TASK: Pick<TaskNode, 'contextRefs' | 'dependencies' | 'filePaths' | 'id'> = {
  id: 'task-1',
  contextRefs: [],
  dependencies: [],
  filePaths: [],
};

const BUNDLE_WITH_ENTITIES: Partial<ContractBundle> = {
  dataModel: {
    projectId: 'test',
    entities: [
      { id: 'entity-user', name: 'User', fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'email', type: 'string', required: true },
        { name: 'name', type: 'string', required: false },
      ]},
      { id: 'entity-expense', name: 'Expense', fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'amount', type: 'number', required: true },
      ]},
    ],
  },
  apiChangeSets: [
    {
      id: 'api-users', changeRequestId: 'cr-1',
      additions: [
        { method: 'GET', path: '/api/users', description: 'List', breaking: false },
        { method: 'POST', path: '/api/users', description: 'Create', breaking: false },
      ],
      modifications: [],
      removals: [],
    },
  ],
  architectureSpec: {
    projectId: 'test',
    decisions: [],
    stackConfig: { frontend: 'react', backend: 'node', database: 'postgres', styling: 'tailwind' },
    assumptionLedgerUpdates: [],
    implementationPatterns: [
      { id: 'data-access-drizzle-only', category: 'data-access', title: 'Drizzle', rule: 'Use Drizzle' },
    ],
  },
};

describe('estimateTaskTokenBudget', () => {
  it('returns base system prompt tokens for task with no refs, deps, or files', () => {
    const budget = estimateTaskTokenBudget(BASE_TASK, {});
    expect(budget).toBe(4_000);
  });

  it('adds cost for dataModel.entity contextRefs', () => {
    const task = {
      ...BASE_TASK,
      contextRefs: [{ kind: 'dataModel.entity' as const, id: 'entity-user' }],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    // base (4000) + entity (800) + 3 fields * 50 (150) = 4950
    expect(budget).toBe(4_950);
  });

  it('adds cost for apiChangeSet contextRefs including endpoint count', () => {
    const task = {
      ...BASE_TASK,
      contextRefs: [{ kind: 'apiChangeSet' as const, id: 'api-users' }],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    // base (4000) + api (600) + 2 endpoints * 200 (400) = 5000
    expect(budget).toBe(5_000);
  });

  it('adds cost for pattern contextRefs', () => {
    const task = {
      ...BASE_TASK,
      contextRefs: [{ kind: 'pattern' as const, id: 'data-access-drizzle-only' }],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    // base (4000) + pattern (150) = 4150
    expect(budget).toBe(4_150);
  });

  it('adds cost per dependency (upstream completion reports)', () => {
    const task = {
      ...BASE_TASK,
      dependencies: ['dep-1', 'dep-2'],
    };
    const budget = estimateTaskTokenBudget(task, {});
    // base (4000) + 2 deps * 3000 = 10000
    expect(budget).toBe(10_000);
  });

  it('adds cost per output file', () => {
    const task = {
      ...BASE_TASK,
      filePaths: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    };
    const budget = estimateTaskTokenBudget(task, {});
    // base (4000) + 3 files * 400 = 5200
    expect(budget).toBe(5_200);
  });

  it('clamps to TASK_TOKEN_BUDGET_CEILING', () => {
    const task = {
      ...BASE_TASK,
      dependencies: Array.from({ length: 50 }, (_, i) => `dep-${i}`),
      filePaths: Array.from({ length: 20 }, (_, i) => `src/file-${i}.ts`),
      contextRefs: [
        { kind: 'dataModel.entity' as const, id: 'entity-user' },
        { kind: 'dataModel.entity' as const, id: 'entity-expense' },
        { kind: 'apiChangeSet' as const, id: 'api-users' },
      ],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    expect(budget).toBe(TASK_TOKEN_BUDGET_CEILING);
  });

  it('clamps to minimum 1000', () => {
    const budget = estimateTaskTokenBudget(BASE_TASK, {});
    expect(budget).toBeGreaterThanOrEqual(1_000);
  });

  it('handles mixed contextRef kinds', () => {
    const task = {
      ...BASE_TASK,
      contextRefs: [
        { kind: 'dataModel.entity' as const, id: 'entity-user' },
        { kind: 'apiChangeSet' as const, id: 'api-users' },
        { kind: 'screenPlan' as const, id: 'screen-1' },
        { kind: 'componentComposition' as const, id: 'comp-1' },
        { kind: 'pattern' as const, id: 'data-access-drizzle-only' },
      ],
      dependencies: ['dep-1'],
      filePaths: ['src/a.ts', 'src/b.ts'],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    // base(4000) + entity(800+150) + api(600+400) + screen(700) + comp(500) + pattern(150)
    // + dep(3000) + files(800) = 11100
    expect(budget).toBe(11_100);
  });

  it('uses default cost when entity not found in bundle', () => {
    const task = {
      ...BASE_TASK,
      contextRefs: [{ kind: 'dataModel.entity' as const, id: 'nonexistent' }],
    };
    const budget = estimateTaskTokenBudget(task, BUNDLE_WITH_ENTITIES);
    // base (4000) + default entity cost (800) = 4800
    expect(budget).toBe(4_800);
  });
});

describe('CashPulse 5-task oracle (Phase 1 budget table)', () => {
  const CASHPULSE_BUNDLE = BUNDLE_WITH_ENTITIES;

  it('scaffold task: budget in 4K-15K range', () => {
    const task = {
      id: 'task-scaffold', contextRefs: [{ kind: 'pattern' as const, id: 'data-access-drizzle-only' }],
      dependencies: [], filePaths: ['package.json', 'drizzle.config.ts'],
    };
    const budget = estimateTaskTokenBudget(task, CASHPULSE_BUNDLE);
    expect(budget).toBeGreaterThanOrEqual(4_000);
    expect(budget).toBeLessThanOrEqual(15_000);
  });

  it('backend task: budget in 8K-40K range', () => {
    const task = {
      id: 'task-expense-api',
      contextRefs: [
        { kind: 'dataModel.entity' as const, id: 'entity-user' },
        { kind: 'apiChangeSet' as const, id: 'api-users' },
        { kind: 'pattern' as const, id: 'data-access-drizzle-only' },
      ],
      dependencies: ['task-scaffold'],
      filePaths: ['src/api/expenses/route.ts', 'src/db/schema/expense.ts'],
    };
    const budget = estimateTaskTokenBudget(task, CASHPULSE_BUNDLE);
    expect(budget).toBeGreaterThanOrEqual(8_000);
    expect(budget).toBeLessThanOrEqual(40_000);
  });

  it('frontend task: budget in 8K-30K range', () => {
    const task = {
      id: 'task-expense-ui',
      contextRefs: [
        { kind: 'screenPlan' as const, id: 'screen-expenses' },
        { kind: 'componentComposition' as const, id: 'screen-expenses' },
        { kind: 'pattern' as const, id: 'data-access-drizzle-only' },
      ],
      dependencies: ['task-expense-api'],
      filePaths: ['src/app/expenses/page.tsx', 'src/components/ExpenseList.tsx'],
    };
    const budget = estimateTaskTokenBudget(task, CASHPULSE_BUNDLE);
    expect(budget).toBeGreaterThanOrEqual(8_000);
    expect(budget).toBeLessThanOrEqual(30_000);
  });

  it('test task: budget in 6K-20K range', () => {
    const task = {
      id: 'task-expense-tests',
      contextRefs: [
        { kind: 'apiChangeSet' as const, id: 'api-users' },
        { kind: 'pattern' as const, id: 'data-access-drizzle-only' },
      ],
      dependencies: ['task-expense-api'],
      filePaths: ['src/api/expenses/__tests__/route.test.ts'],
    };
    const budget = estimateTaskTokenBudget(task, CASHPULSE_BUNDLE);
    expect(budget).toBeGreaterThanOrEqual(6_000);
    expect(budget).toBeLessThanOrEqual(20_000);
  });

  it('integration task: budget in 10K-50K range', () => {
    const task = {
      id: 'task-integration',
      contextRefs: [
        { kind: 'dataModel.entity' as const, id: 'entity-user' },
        { kind: 'apiChangeSet' as const, id: 'api-users' },
        { kind: 'screenPlan' as const, id: 'screen-expenses' },
      ],
      dependencies: ['task-expense-api', 'task-expense-ui'],
      filePaths: ['e2e/expenses.spec.ts'],
    };
    const budget = estimateTaskTokenBudget(task, CASHPULSE_BUNDLE);
    expect(budget).toBeGreaterThanOrEqual(10_000);
    expect(budget).toBeLessThanOrEqual(50_000);
  });
});
