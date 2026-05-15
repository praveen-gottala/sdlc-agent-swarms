/**
 * Tests for Node 1 — Context Assembler.
 */

import { createContextAssembler } from './context-assembler.js';
import { mockDeps, makeState } from '../../test-utils.js';
import type { EnrichedRequirement } from '@agentforge/core';

const mockRequirement: EnrichedRequirement = {
  id: 'req-1',
  rawInput: 'Build a task management app',
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

describe('createContextAssembler (Node 1)', () => {
  it('produces a ConstraintSet in greenfield mode', async () => {
    const node = createContextAssembler(mockDeps);
    const state = makeState({
      mode: 'greenfield',
      enrichedRequirement: mockRequirement,
    });

    const result = await node(state);

    expect(result.constraintSet).toBeDefined();
    expect(result.constraintSet!.projectId).toBe('test-project');
    expect(result.constraintSet!.mode).toBe('greenfield');
    expect(result.constraintSet!.constraints).toEqual([]);
    expect(result.constraintSet!.gaps).toEqual([]);
  });

  it('returns empty when no enrichedRequirement', async () => {
    const node = createContextAssembler(mockDeps);
    const result = await node(makeState());

    expect(result.constraintSet).toBeUndefined();
  });
});
