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
  it('returns empty bundle and designSpecs for empty contextRefs', () => {
    const result = sliceContractBundle([], FULL_BUNDLE);
    expect(result.bundle).toEqual({});
    expect(result.existingDesignSpecs).toEqual({});
  });

  it('slices dataModel.entity by id', () => {
    const refs: ContextRef[] = [{ kind: 'dataModel.entity', id: 'entity-expense' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.dataModel).toBeDefined();
    expect(bundle.dataModel!.entities).toHaveLength(1);
    expect(bundle.dataModel!.entities[0]!.id).toBe('entity-expense');
    expect(bundle.dataModel!.projectId).toBe('cashpulse');
    expect(bundle.apiChangeSets).toBeUndefined();
    expect(bundle.screenPlans).toBeUndefined();
  });

  it('slices multiple dataModel entities', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'dataModel.entity', id: 'entity-budget' },
    ];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.dataModel!.entities).toHaveLength(2);
    const ids = bundle.dataModel!.entities.map((e) => e.id);
    expect(ids).toContain('entity-expense');
    expect(ids).toContain('entity-budget');
  });

  it('slices apiChangeSet by id', () => {
    const refs: ContextRef[] = [{ kind: 'apiChangeSet', id: 'api-expenses' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.apiChangeSets).toHaveLength(1);
    expect(bundle.apiChangeSets![0]!.id).toBe('api-expenses');
    expect(bundle.dataModel).toBeUndefined();
  });

  it('slices componentComposition by screenId match', () => {
    const refs: ContextRef[] = [{ kind: 'componentComposition', id: 'screen-dashboard' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.componentComposition).toBeDefined();
    expect(bundle.componentComposition!.screenId).toBe('screen-dashboard');
  });

  it('omits componentComposition when screenId does not match', () => {
    const refs: ContextRef[] = [{ kind: 'componentComposition', id: 'screen-nonexistent' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.componentComposition).toBeUndefined();
  });

  it('slices screenPlans by id', () => {
    const refs: ContextRef[] = [{ kind: 'screenPlan', id: 'screen-expenses' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.screenPlans).toHaveLength(1);
    expect(bundle.screenPlans![0]!.id).toBe('screen-expenses');
  });

  it('slices patterns from architectureSpec by id', () => {
    const refs: ContextRef[] = [{ kind: 'pattern', id: 'data-access-drizzle-only' }];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.architectureSpec).toBeDefined();
    expect(bundle.architectureSpec!.implementationPatterns).toHaveLength(1);
    expect(bundle.architectureSpec!.implementationPatterns![0]!.id).toBe('data-access-drizzle-only');
    expect(bundle.architectureSpec!.decisions).toEqual([]);
  });

  it('handles mixed ContextRef kinds in a single call', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'apiChangeSet', id: 'api-budgets' },
      { kind: 'screenPlan', id: 'screen-dashboard' },
      { kind: 'pattern', id: 'api-error-rfc7807' },
    ];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.dataModel!.entities).toHaveLength(1);
    expect(bundle.apiChangeSets).toHaveLength(1);
    expect(bundle.screenPlans).toHaveLength(1);
    expect(bundle.architectureSpec!.implementationPatterns).toHaveLength(1);
    expect(bundle.componentComposition).toBeUndefined();
  });

  it('omits fields when referenced ids do not exist in bundle', () => {
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'nonexistent' },
      { kind: 'apiChangeSet', id: 'nonexistent' },
    ];
    const { bundle } = sliceContractBundle(refs, FULL_BUNDLE);
    expect(bundle.dataModel).toBeUndefined();
    expect(bundle.apiChangeSets).toBeUndefined();
  });

  it('handles bundle with missing optional fields gracefully', () => {
    const sparseBundle: Partial<ContractBundle> = { apiChangeSets: [] };
    const refs: ContextRef[] = [
      { kind: 'dataModel.entity', id: 'entity-expense' },
      { kind: 'apiChangeSet', id: 'api-expenses' },
    ];
    const { bundle } = sliceContractBundle(refs, sparseBundle);
    expect(bundle.dataModel).toBeUndefined();
    expect(bundle.apiChangeSets).toBeUndefined();
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
