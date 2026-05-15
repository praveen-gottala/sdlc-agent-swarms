/**
 * Unit tests for the per-gate retry routing matrix (M3 Phase 7).
 */

import { routeAfterCritic, getRetryTargetForGate } from './retry-routing.js';
import { makeState } from '../test-utils.js';

describe('getRetryTargetForGate', () => {
  it.each([
    ['schema-validation', 'taskPlanner'],
    ['dag-acyclic', 'taskPlanner'],
    ['single-writer', 'taskPlanner'],
    ['prd-criterion-coverage', 'taskPlanner'],
    ['entity-reference-integrity', 'contractDesigner'],
    ['gap-resolution-completeness', 'architectureWriter'],
    ['openapi-lint', 'contractDesigner'],
    ['migration-sql-parses', 'contractDesigner'],
    ['adr-completeness', 'architectureWriter'],
    ['patternRef-resolution', 'taskPlanner'],
    ['contextRef-resolution', 'taskPlanner'],
    ['acceptanceCriteria-coverage', 'taskPlanner'],
    ['tokenBudget-feasibility', 'taskPlanner'],
    ['mode-consistency', 'escalationGate'],
  ] as const)('gate "%s" routes to %s', (gate, expected) => {
    expect(getRetryTargetForGate(gate)).toBe(expected);
  });

  it('routes unknown gates to escalationGate', () => {
    expect(getRetryTargetForGate('unknown-gate')).toBe('escalationGate');
  });
});

describe('routeAfterCritic', () => {
  it('routes to gate2Approval when critic passed', () => {
    expect(routeAfterCritic(makeState({ criticPassed: true }))).toBe('gate2Approval');
  });

  it('routes to escalationGate when max retries exceeded', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 2,
      lastFailedGate: 'schema-validation',
    }))).toBe('escalationGate');
  });

  it('routes to escalationGate when no lastFailedGate set', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: null,
    }))).toBe('escalationGate');
  });

  it('routes to architectureWriter for gap-resolution failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'gap-resolution-completeness',
    }))).toBe('architectureWriter');
  });

  it('routes to contractDesigner for entity-reference failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'entity-reference-integrity',
    }))).toBe('contractDesigner');
  });

  it('routes to taskPlanner for schema-validation failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'schema-validation',
    }))).toBe('taskPlanner');
  });

  it('routes to escalationGate for mode-consistency failure (human resolution)', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'mode-consistency',
    }))).toBe('escalationGate');
  });

  it('routes to contractDesigner for openapi-lint failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'openapi-lint',
    }))).toBe('contractDesigner');
  });

  it('routes to architectureWriter for adr-completeness failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'adr-completeness',
    }))).toBe('architectureWriter');
  });

  it('routes to taskPlanner for tokenBudget-feasibility failure', () => {
    expect(routeAfterCritic(makeState({
      criticPassed: false,
      criticRetries: 1,
      lastFailedGate: 'tokenBudget-feasibility',
    }))).toBe('taskPlanner');
  });
});
