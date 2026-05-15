import { runArchitectScenario, runArchitectScenarioDetailed } from './architect-runner.js';
import { loadArchitectScenarios } from './scenarios/architect/index.js';
import { getRetryTargetForGate } from '@agentforge/agents-architect';

describe('runArchitectScenario', () => {
  const scenarios = loadArchitectScenarios();

  it('correct-cashpulse: all 14 gates pass', () => {
    const scenario = scenarios.find((s) => s.id === 'correct-cashpulse')!;
    const metrics = runArchitectScenario(scenario);

    expect(metrics.criticPassed).toBe(true);
    expect(metrics.expectedPass).toBe(true);
    expect(metrics.isCorrectVerdict).toBe(true);
    expect(metrics.falsePositive).toBe(false);
    expect(metrics.falseNegative).toBe(false);
    expect(metrics.gateResults.every((g) => g.passed)).toBe(true);
  });

  it('missing-field: gates 4 + 5 + 9 fail', () => {
    const scenario = scenarios.find((s) => s.id === 'missing-field')!;
    const metrics = runArchitectScenario(scenario);

    expect(metrics.criticPassed).toBe(false);
    expect(metrics.expectedPass).toBe(false);
    expect(metrics.isCorrectVerdict).toBe(true);

    const failedGates = metrics.gateResults
      .filter((g) => !g.passed)
      .map((g) => g.name);

    expect(failedGates).toContain('prd-criterion-coverage');
    expect(failedGates).toContain('entity-reference-integrity');
    expect(failedGates).toContain('adr-completeness');
  });

  it('contradictory: gates 2 + 3 + 6 + 7 + 9 fail', () => {
    const scenario = scenarios.find((s) => s.id === 'contradictory')!;
    const metrics = runArchitectScenario(scenario);

    expect(metrics.criticPassed).toBe(false);
    expect(metrics.expectedPass).toBe(false);
    expect(metrics.isCorrectVerdict).toBe(true);

    const failedGates = metrics.gateResults
      .filter((g) => !g.passed)
      .map((g) => g.name);

    expect(failedGates).toContain('dag-acyclic');
    expect(failedGates).toContain('single-writer');
    expect(failedGates).toContain('gap-resolution-completeness');
    expect(failedGates).toContain('openapi-lint');
    expect(failedGates).toContain('adr-completeness');
  });

  it('add-budgeting-brownfield: all 14 gates pass with existingFiles', () => {
    const scenario = scenarios.find((s) => s.id === 'add-budgeting-brownfield')!;
    expect(scenario.existingFiles).toBeDefined();
    expect(scenario.existingFiles!.length).toBeGreaterThan(0);

    const metrics = runArchitectScenario(scenario);

    expect(metrics.criticPassed).toBe(true);
    expect(metrics.expectedPass).toBe(true);
    expect(metrics.isCorrectVerdict).toBe(true);
    expect(metrics.falsePositive).toBe(false);
    expect(metrics.falseNegative).toBe(false);
    expect(metrics.gateResults.every((g) => g.passed)).toBe(true);
  });

  it('all scenarios produce correct verdicts (no false positives or negatives)', () => {
    for (const scenario of scenarios) {
      const metrics = runArchitectScenario(scenario);
      expect(metrics.isCorrectVerdict).toBe(true);
      expect(metrics.falsePositive).toBe(false);
      expect(metrics.falseNegative).toBe(false);
    }
  });
});

describe('TaskNode field validation', () => {
  const scenarios = loadArchitectScenarios();

  it('all fixtures populate the 5 required TaskNode fields', () => {
    for (const scenario of scenarios) {
      const metrics = runArchitectScenario(scenario);
      expect(metrics.taskNodeFieldFindings).toEqual([]);
    }
  });
});

describe('retry-routing validation', () => {
  const scenarios = loadArchitectScenarios();

  it('failed scenarios produce retry targets consistent with the routing matrix', () => {
    for (const scenario of scenarios) {
      const { criticReport, firstFailedGate } = runArchitectScenarioDetailed(scenario);

      if (criticReport.passed) {
        expect(firstFailedGate).toBeNull();
        continue;
      }

      expect(firstFailedGate).not.toBeNull();
      const target = getRetryTargetForGate(firstFailedGate!);
      expect(['architectureWriter', 'contractDesigner', 'taskPlanner', 'escalationGate']).toContain(target);
    }
  });

  it('missing-field first failed gate routes to taskPlanner (prd-criterion-coverage)', () => {
    const scenario = scenarios.find((s) => s.id === 'missing-field')!;
    const { firstFailedGate } = runArchitectScenarioDetailed(scenario);
    expect(firstFailedGate).toBe('prd-criterion-coverage');
    expect(getRetryTargetForGate(firstFailedGate!)).toBe('taskPlanner');
  });

  it('contradictory first failed gate routes to taskPlanner (dag-acyclic)', () => {
    const scenario = scenarios.find((s) => s.id === 'contradictory')!;
    const { firstFailedGate } = runArchitectScenarioDetailed(scenario);
    expect(firstFailedGate).toBe('dag-acyclic');
    expect(getRetryTargetForGate(firstFailedGate!)).toBe('taskPlanner');
  });
});
