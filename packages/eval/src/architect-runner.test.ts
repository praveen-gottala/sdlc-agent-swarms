import { runArchitectScenario } from './architect-runner.js';
import { loadArchitectScenarios } from './scenarios/architect/index.js';

describe('runArchitectScenario', () => {
  const scenarios = loadArchitectScenarios();

  it('correct-cashpulse: all 9 gates pass', () => {
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

  it('all scenarios produce correct verdicts (no false positives or negatives)', () => {
    for (const scenario of scenarios) {
      const metrics = runArchitectScenario(scenario);
      expect(metrics.isCorrectVerdict).toBe(true);
      expect(metrics.falsePositive).toBe(false);
      expect(metrics.falseNegative).toBe(false);
    }
  });
});
