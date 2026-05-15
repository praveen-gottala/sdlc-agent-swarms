/**
 * Tests for sliceContractBundle — ContextRef-based bundle filtering.
 */

import type { ComponentComposition, ContractBundle, ContextRef } from '@agentforge/core';
import { sliceContractBundle, stateCompositionsToBundle } from './context-slicer.js';

const FULL_BUNDLE: Partial<ContractBundle> = {
  dataModel: {
    projectId: 'cashpulse',
    entities: [
      { id: 'entity-expense', name: 'Expense', fields: [{ name: 'id', type: 'uuid', required: true }] },
      { id: 'entity-category', name: 'Category', fields: [{ name: 'id', type: 'uuid', required: true }] },
      { id: 'entity-budget', name: 'Budget', fields: [{ name: 'id', type: 'uuid', required: true }] },
    ],
  },
  apiChangeSets: [
    { id: 'api-expenses', changeRequestId: 'cr-1', additions: [{ method: 'GET', path: '/api/expenses', description: 'List expenses', breaking: false }], modifications: [], removals: [] },
    { id: 'api-budgets', changeRequestId: 'cr-1', additions: [{ method: 'GET', path: '/api/budgets', description: 'List budgets', breaking: false }], modifications: [], removals: [] },
  ],
  componentComposition: {
    screenId: 'screen-dashboard',
    componentTree: [{ id: 'ct-1', type: 'BudgetSummaryCard' }],
  },
  screenPlans: [
    { id: 'screen-dashboard', featureId: 'f-1', screenType: 'page', route: '/dashboard', components: ['BudgetSummaryCard'], dataBindings: [], navigationTargets: [] },
    { id: 'screen-expenses', featureId: 'f-2', screenType: 'page', route: '/expenses', components: ['ExpenseList'], dataBindings: [], navigationTargets: [] },
  ],
  architectureSpec: {
    projectId: 'cashpulse',
    decisions: [],
    stackConfig: { frontend: 'react', backend: 'node', database: 'postgres', styling: 'tailwind' },
    assumptionLedgerUpdates: [],
    implementationPatterns: [
      { id: 'data-access-drizzle-only', category: 'data-access', title: 'Drizzle ORM', rule: 'Use Drizzle' },
      { id: 'api-error-rfc7807', category: 'error', title: 'RFC 7807 errors', rule: 'Use RFC 7807' },
    ],
  },
};

describe('sliceContractBundle', () => {
  it('returns empty object for empty contextRefs', () => {
    expect(sliceContractBundle([], FULL_BUNDLE)).toEqual({});
  });

  it('slices dataModel.entity by id', () => {
    const refs: ContextRef[] = [{ kind: 'dataModel.entity', id: 'entity-expense' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.dataModel).toBeDefined();
    expect(sliced.dataModel!.entities).toHaveLength(1);
    expect(sliced.dataModel!.entities[0]!.id).toBe('entity-expense');
    expect(sliced.dataModel!.projectId).toBe('cashpulse');
    expect(sliced.apiChangeSets).toBeUndefined();
    expect(sliced.screenPlans).toBeUndefined();
  });

  it('slices multiple dataModel entities', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'dataModel.entity', id: 'entity-budget' },
    ];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.dataModel!.entities).toHaveLength(2);
    const ids = sliced.dataModel!.entities.map((e) => e.id);
    expect(ids).toContain('entity-expense');
    expect(ids).toContain('entity-budget');
  });

  it('slices apiChangeSet by id', () => {
    const refs: ContextRef[] = [{ kind: 'apiChangeSet', id: 'api-expenses' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.apiChangeSets).toHaveLength(1);
    expect(sliced.apiChangeSets![0]!.id).toBe('api-expenses');
    expect(sliced.dataModel).toBeUndefined();
  });

  it('slices componentComposition by screenId match', () => {
    const refs: ContextRef[] = [{ kind: 'componentComposition', id: 'screen-dashboard' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.componentComposition).toBeDefined();
    expect(sliced.componentComposition!.screenId).toBe('screen-dashboard');
  });

  it('omits componentComposition when screenId does not match', () => {
    const refs: ContextRef[] = [{ kind: 'componentComposition', id: 'screen-nonexistent' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.componentComposition).toBeUndefined();
  });

  it('slices screenPlans by id', () => {
    const refs: ContextRef[] = [{ kind: 'screenPlan', id: 'screen-expenses' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.screenPlans).toHaveLength(1);
    expect(sliced.screenPlans![0]!.id).toBe('screen-expenses');
  });

  it('slices patterns from architectureSpec by id', () => {
    const refs: ContextRef[] = [{ kind: 'pattern', id: 'data-access-drizzle-only' }];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.architectureSpec).toBeDefined();
    expect(sliced.architectureSpec!.implementationPatterns).toHaveLength(1);
    expect(sliced.architectureSpec!.implementationPatterns![0]!.id).toBe('data-access-drizzle-only');
    expect(sliced.architectureSpec!.decisions).toEqual([]);
  });

  it('handles mixed ContextRef kinds in a single call', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'apiChangeSet', id: 'api-budgets' },
      { kind: 'screenPlan', id: 'screen-dashboard' },
      { kind: 'pattern', id: 'api-error-rfc7807' },
    ];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.dataModel!.entities).toHaveLength(1);
    expect(sliced.apiChangeSets).toHaveLength(1);
    expect(sliced.screenPlans).toHaveLength(1);
    expect(sliced.architectureSpec!.implementationPatterns).toHaveLength(1);
    expect(sliced.componentComposition).toBeUndefined();
  });

  it('omits fields when referenced ids do not exist in bundle', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'nonexistent' },
      { kind: 'apiChangeSet', id: 'nonexistent' },
    ];
    const sliced = sliceContractBundle(refs, FULL_BUNDLE);
    expect(sliced.dataModel).toBeUndefined();
    expect(sliced.apiChangeSets).toBeUndefined();
  });

  it('handles bundle with missing optional fields gracefully', () => {
    const sparseBundle: Partial<ContractBundle> = { apiChangeSets: [] };
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'apiChangeSet', id: 'api-expenses' },
    ];
    const sliced = sliceContractBundle(refs, sparseBundle);
    expect(sliced.dataModel).toBeUndefined();
    expect(sliced.apiChangeSets).toBeUndefined();
  });
});

describe('stateCompositionsToBundle', () => {
  const COMPOSITIONS: ComponentComposition[] = [
    { screenId: 'screen-dashboard', componentTree: [{ id: 'ct-1', type: 'Card' }] },
    { screenId: 'screen-settings', componentTree: [{ id: 'ct-2', type: 'Form' }] },
  ];

  it('returns undefined for empty array', () => {
    expect(stateCompositionsToBundle([])).toBeUndefined();
  });

  it('returns first element when no filter provided', () => {
    const result = stateCompositionsToBundle(COMPOSITIONS);
    expect(result?.screenId).toBe('screen-dashboard');
  });

  it('returns matching element when filter provided', () => {
    const filter = new Set(['screen-settings']);
    const result = stateCompositionsToBundle(COMPOSITIONS, filter);
    expect(result?.screenId).toBe('screen-settings');
  });

  it('returns undefined when filter matches nothing', () => {
    const filter = new Set(['screen-nonexistent']);
    const result = stateCompositionsToBundle(COMPOSITIONS, filter);
    expect(result).toBeUndefined();
  });
});
