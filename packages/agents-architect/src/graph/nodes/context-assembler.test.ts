/**
 * Tests for Node 1 — Context Assembler.
 */

import { createContextAssembler, extractConstraintsFromPrd, extractGapsForGreenfield } from './context-assembler.js';
import { mockDeps, makeState } from '../../test-utils.js';
import type { EnrichedRequirement } from '@agentforge/core';

const minimalRequirement: EnrichedRequirement = {
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

const richRequirement: EnrichedRequirement = {
  ...minimalRequirement,
  prd: {
    ...minimalRequirement.prd,
    features: [
      { id: 'f-1', name: 'Track daily expenses', description: 'Users can log expenses with amount and category' },
      { id: 'f-2', name: 'Real-time budget alerts', description: 'Push notification when spending exceeds budget' },
    ],
    dataEntities: [
      { id: 'e-1', name: 'Expense', fields: [{ name: 'id', type: 'string' }, { name: 'categoryId', type: 'reference' }, { name: 'amount', type: 'number' }] },
      { id: 'e-2', name: 'Category', fields: [{ name: 'id', type: 'string' }, { name: 'name', type: 'string' }] },
      { id: 'e-3', name: 'Budget', fields: [{ name: 'id', type: 'string' }, { name: 'limit', type: 'number' }] },
      { id: 'e-4', name: 'UserSettings', fields: [{ name: 'id', type: 'string' }] },
      { id: 'e-5', name: 'MonthSummary', fields: [{ name: 'id', type: 'string' }] },
    ],
    nfrs: [
      { id: 'nfr-1', category: 'Performance', description: 'Page load under 2 seconds' },
      { id: 'nfr-2', category: 'Accessibility', description: 'WCAG 2.1 AA compliance, 36x36px touch targets' },
    ],
    outOfScope: ['User authentication and login', 'Dark mode theme'],
  },
};

describe('extractConstraintsFromPrd', () => {
  it('maps NFRs to constraints with correct hard/soft classification', () => {
    const constraints = extractConstraintsFromPrd(richRequirement.prd);

    const nfrConstraints = constraints.filter((c) => c.source === 'prd.nfrs');
    expect(nfrConstraints).toHaveLength(2);

    const performanceConstraint = nfrConstraints.find((c) => c.id === 'constraint-nfr-1');
    expect(performanceConstraint?.type).toBe('soft');
    expect(performanceConstraint?.category).toBe('Performance');

    const a11yConstraint = nfrConstraints.find((c) => c.id === 'constraint-nfr-2');
    expect(a11yConstraint?.type).toBe('hard');
    expect(a11yConstraint?.category).toBe('Accessibility');
  });

  it('maps outOfScope entries to soft scope-exclusion constraints', () => {
    const constraints = extractConstraintsFromPrd(richRequirement.prd);

    const scopeConstraints = constraints.filter((c) => c.source === 'prd.outOfScope');
    expect(scopeConstraints).toHaveLength(2);
    expect(scopeConstraints[0].type).toBe('soft');
    expect(scopeConstraints[0].category).toBe('scope-exclusion');
    expect(scopeConstraints[0].description).toContain('User authentication');
  });

  it('returns empty array for empty PRD', () => {
    const constraints = extractConstraintsFromPrd(minimalRequirement.prd);
    expect(constraints).toEqual([]);
  });
});

describe('extractGapsForGreenfield', () => {
  it('includes universal base gaps', () => {
    const gaps = extractGapsForGreenfield(minimalRequirement.prd);
    const ids = gaps.map((g) => g.id);
    expect(ids).toContain('gap-data-store');
    expect(ids).toContain('gap-styling-approach');
    expect(ids).toContain('gap-component-library');
  });

  it('adds entity-driven gaps when 5+ entities exist', () => {
    const gaps = extractGapsForGreenfield(richRequirement.prd);
    const ids = gaps.map((g) => g.id);
    expect(ids).toContain('gap-orm-strategy');
  });

  it('adds feature-driven gaps from PRD feature descriptions', () => {
    const gaps = extractGapsForGreenfield(richRequirement.prd);
    const ids = gaps.map((g) => g.id);
    expect(ids).toContain('gap-realtime-strategy');
    expect(ids).toContain('gap-notification-channel');
  });

  it('adds performance-driven gap when performance NFR exists', () => {
    const gaps = extractGapsForGreenfield(richRequirement.prd);
    const ids = gaps.map((g) => g.id);
    expect(ids).toContain('gap-caching-strategy');
  });

  it('auto-resolves auth gap when authentication is out of scope', () => {
    const gaps = extractGapsForGreenfield(richRequirement.prd);
    const authGap = gaps.find((g) => g.id === 'gap-auth-strategy');
    expect(authGap).toBeDefined();
    expect(authGap?.resolvedValue).toBe('none');
    expect(authGap?.resolvedBy).toBe('scope-exclusion');
  });

  it('does not produce duplicate gap IDs', () => {
    const gaps = extractGapsForGreenfield(richRequirement.prd);
    const ids = gaps.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('createContextAssembler (Node 1)', () => {
  it('produces a ConstraintSet with constraints and gaps in greenfield mode', async () => {
    const node = createContextAssembler(mockDeps);
    const state = makeState({
      mode: 'greenfield',
      enrichedRequirement: richRequirement,
    });

    const result = await node(state);

    expect(result.constraintSet).toBeDefined();
    expect(result.constraintSet!.projectId).toBe('test-project');
    expect(result.constraintSet!.mode).toBe('greenfield');
    expect(result.constraintSet!.constraints.length).toBeGreaterThan(0);
    expect(result.constraintSet!.gaps.length).toBeGreaterThan(0);
  });

  it('returns empty when no enrichedRequirement', async () => {
    const node = createContextAssembler(mockDeps);
    const result = await node(makeState());

    expect(result.constraintSet).toBeUndefined();
  });
});
