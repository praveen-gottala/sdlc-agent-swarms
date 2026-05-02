/**
 * Critic node tests.
 * Scope: EARS compliance, INVEST compliance, DAG consistency,
 * bounded retry, clean pass, max-retry pass-with-warnings.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState } from '../../types.js';
import type { FeaturePlan } from '@agentforge/core';
import {
  createCritic,
  checkEARSCompliance,
  checkINVESTCompliance,
  checkDAGConsistency,
} from '../critic.js';

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return { ...actual, debugLog: jest.fn() };
});

const VALID_PLAN: FeaturePlan = {
  id: 'plan-1',
  features: [
    {
      id: 'feat-001',
      name: 'Add Expense',
      description: 'Record new expenses with amount, category, and date',
      acceptanceCriteria: [
        { id: 'ears-0', condition: 'user submits form', behavior: 'save expense', formatted: 'WHEN user submits form THE SYSTEM SHALL save expense' },
      ],
      priority: 'must-have',
      dependencies: [],
      status: 'planned',
    },
    {
      id: 'feat-002',
      name: 'Dashboard',
      description: 'Display spending overview with monthly totals and charts',
      acceptanceCriteria: [
        { id: 'ears-1', condition: 'user opens dashboard', behavior: 'show monthly total', formatted: 'WHEN user opens dashboard THE SYSTEM SHALL show monthly total' },
      ],
      priority: 'should-have',
      dependencies: ['feat-001'],
      status: 'planned',
    },
  ],
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Build expense tracker',
    mode: 'bootstrap',
    context: {},
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 1,
    maxRounds: 3,
    error: null,
    prdDraft: null,
    featurePlan: VALID_PLAN,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    threadId: '',
    ...overrides,
  };
}

const mockDeps: ClarifierDeps = {
  provider: {
    name: 'mock',
    models: ['claude-sonnet-4-6'],
    complete: jest.fn(),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
    estimateCost: jest.fn(),
  } as unknown as ClarifierDeps['provider'],
  projectRoot: '/tmp/test',
  projectId: 'test-project',
};

describe('checkEARSCompliance', () => {
  it('passes for features with valid criteria', () => {
    const issues = checkEARSCompliance(VALID_PLAN);
    expect(issues).toHaveLength(0);
  });

  it('flags features with no acceptance criteria', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Empty Feature', description: 'No criteria',
        acceptanceCriteria: [], priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };
    const issues = checkEARSCompliance(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].description).toContain('no acceptance criteria');
  });

  it('flags criteria with empty condition or behavior', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Bad Criteria', description: 'Has empty criterion',
        acceptanceCriteria: [
          { id: 'c1', condition: '', behavior: 'something', formatted: '' },
        ],
        priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };
    const issues = checkEARSCompliance(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
  });
});

describe('checkINVESTCompliance', () => {
  it('passes for well-described features', () => {
    const issues = checkINVESTCompliance(VALID_PLAN);
    expect(issues).toHaveLength(0);
  });

  it('warns when feature description is too short', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Vague', description: 'Short',
        acceptanceCriteria: [{ id: 'c1', condition: 'x', behavior: 'y', formatted: 'z' }],
        priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };
    const issues = checkINVESTCompliance(plan);
    expect(issues.some((i) => i.description.includes('insufficient description'))).toBe(true);
    expect(issues[0].severity).toBe('warning');
  });

  it('warns when feature has too many criteria', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Large', description: 'A very detailed feature with many parts',
        acceptanceCriteria: Array.from({ length: 12 }, (_, i) => ({
          id: `c${i}`, condition: `cond${i}`, behavior: `behav${i}`, formatted: `formatted${i}`,
        })),
        priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };
    const issues = checkINVESTCompliance(plan);
    expect(issues.some((i) => i.description.includes('Small'))).toBe(true);
  });
});

describe('checkDAGConsistency', () => {
  it('passes for valid dependency chain', () => {
    const issues = checkDAGConsistency(VALID_PLAN);
    expect(issues).toHaveLength(0);
  });

  it('flags dependencies on non-existent features', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Orphan', description: 'References missing feature',
        acceptanceCriteria: [{ id: 'c1', condition: 'x', behavior: 'y', formatted: 'z' }],
        priority: 'must-have', dependencies: ['f-nonexistent'], status: 'planned',
      }],
    };
    const issues = checkDAGConsistency(plan);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].description).toContain('f-nonexistent');
  });

  it('detects circular dependencies', () => {
    const plan: FeaturePlan = {
      id: 'plan-1',
      features: [
        { id: 'a', name: 'A', description: 'Feature A', acceptanceCriteria: [{ id: 'c1', condition: 'x', behavior: 'y', formatted: 'z' }], priority: 'must-have', dependencies: ['b'], status: 'planned' },
        { id: 'b', name: 'B', description: 'Feature B', acceptanceCriteria: [{ id: 'c2', condition: 'x', behavior: 'y', formatted: 'z' }], priority: 'must-have', dependencies: ['a'], status: 'planned' },
      ],
    };
    const issues = checkDAGConsistency(plan);
    expect(issues.some((i) => i.description.includes('cycle'))).toBe(true);
  });
});

describe('createCritic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes clean feature plan', async () => {
    const node = createCritic(mockDeps);
    const result = await node(makeState());

    expect(result.criticPassed).toBe(true);
  });

  it('fails on first error with retry available', async () => {
    const badPlan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Bad', description: 'Feature',
        acceptanceCriteria: [], priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };

    const node = createCritic(mockDeps);
    const result = await node(makeState({ featurePlan: badPlan, criticRetries: 0 }));

    expect(result.criticPassed).toBe(false);
    expect(result.criticRetries).toBe(1);
  });

  it('passes after max retries even with errors', async () => {
    const badPlan: FeaturePlan = {
      id: 'plan-1',
      features: [{
        id: 'f1', name: 'Bad', description: 'Feature',
        acceptanceCriteria: [], priority: 'must-have', dependencies: [], status: 'planned',
      }],
    };

    const node = createCritic(mockDeps);
    const result = await node(makeState({ featurePlan: badPlan, criticRetries: 2 }));

    expect(result.criticPassed).toBe(true);
  });

  it('handles null featurePlan with retry logic', async () => {
    const node = createCritic(mockDeps);
    const result = await node(makeState({ featurePlan: null, criticRetries: 0 }));

    expect(result.criticPassed).toBe(false);
    expect(result.criticRetries).toBe(1);
  });

  it('passes null featurePlan after max retries', async () => {
    const node = createCritic(mockDeps);
    const result = await node(makeState({ featurePlan: null, criticRetries: 2 }));

    expect(result.criticPassed).toBe(true);
  });
});
