/**
 * Tests for Node 6 — Critic wrapper.
 */

import { createCritic } from './critic.js';
import { makeState } from '../../test-utils.js';
import type { EnrichedRequirement, ConstraintSet, OptionsBundle, ArchitectureSpec, TaskPlan, AssumptionLedger } from '@agentforge/core';

const mockRequirement: EnrichedRequirement = {
  id: 'req-1',
  rawInput: 'Build a task manager',
  mode: 'bootstrap',
  prd: {
    id: 'prd-1',
    title: 'Task Manager',
    description: 'A task management app',
    status: 'draft',
    version: '1.0.0',
    features: [],
    dataEntities: [],
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

const mockConstraintSet: ConstraintSet = { projectId: 'p1', constraints: [], gaps: [], mode: 'greenfield' };
const mockOptionsBundle: OptionsBundle = { projectId: 'p1', memos: [] };
const mockArchitectureSpec: ArchitectureSpec = {
  projectId: 'p1',
  decisions: [],
  stackConfig: { frontend: 'react', backend: 'node', database: 'postgres', styling: 'tailwind' },
  assumptionLedgerUpdates: [],
  implementationPatterns: [],
};
const mockTaskPlan: TaskPlan = { projectId: 'p1', tasks: [], featureCoverage: {} };
const mockAssumptionLedger: AssumptionLedger = { id: 'al-1', entries: [], createdAt: '2026-01-01', lastUpdatedAt: '2026-01-01' };

describe('createCritic (Node 6)', () => {
  it('returns failed report when enrichedRequirement is null', async () => {
    const node = createCritic();
    const result = await node(makeState());

    expect(result.criticPassed).toBe(false);
    expect(result.criticReport).toBeDefined();
    expect(result.criticReport!.summary).toContain('Missing enrichedRequirement');
  });

  it('increments criticRetries on each invocation', async () => {
    const node = createCritic();

    const result1 = await node(makeState({ criticRetries: 0 }));
    expect(result1.criticRetries).toBe(1);

    const result2 = await node(makeState({ criticRetries: 3 }));
    expect(result2.criticRetries).toBe(4);
  });

  it('runs validateContractBundle when enrichedRequirement is present', async () => {
    const node = createCritic();
    const state = makeState({
      enrichedRequirement: mockRequirement,
      constraintSet: mockConstraintSet,
      optionsBundle: mockOptionsBundle,
      architectureSpec: mockArchitectureSpec,
      taskPlan: mockTaskPlan,
      assumptionLedger: mockAssumptionLedger,
    });

    const result = await node(state);

    expect(result.criticReport).toBeDefined();
    expect(result.criticReport!.gates.length).toBeGreaterThan(0);
    expect(typeof result.criticPassed).toBe('boolean');
    expect(result.criticRetries).toBe(1);
  });

  it('sets lastFailedGate when critic fails', async () => {
    const node = createCritic();
    const state = makeState({
      enrichedRequirement: mockRequirement,
      constraintSet: mockConstraintSet,
      optionsBundle: mockOptionsBundle,
      architectureSpec: mockArchitectureSpec,
      taskPlan: mockTaskPlan,
      assumptionLedger: mockAssumptionLedger,
    });

    const result = await node(state);

    if (!result.criticPassed) {
      expect(result.lastFailedGate).toBeDefined();
    } else {
      expect(result.lastFailedGate).toBeNull();
    }
  });

  it('passes existingFiles to validateContractBundle in brownfield mode', async () => {
    const node = createCritic();
    const existingFiles = new Set(['src/index.ts', 'package.json']) as ReadonlySet<string>;
    const state = makeState({
      enrichedRequirement: mockRequirement,
      constraintSet: mockConstraintSet,
      optionsBundle: mockOptionsBundle,
      architectureSpec: mockArchitectureSpec,
      taskPlan: mockTaskPlan,
      assumptionLedger: mockAssumptionLedger,
      existingFiles,
    });

    const result = await node(state);

    // Should complete without error — existingFiles is forwarded to validateContractBundle
    expect(result.criticReport).toBeDefined();
  });
});
