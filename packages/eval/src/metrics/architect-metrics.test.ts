import { computeArchitectMetrics, ARCHITECT_METRIC_DEFINITIONS } from './architect-metrics.js';
import type { CriticReport } from '@agentforge/core';
import type { ArchitectExpectedBehavior } from '../types.js';

function makeReport(passed: boolean, gateOverrides?: Partial<Record<string, boolean>>): CriticReport {
  const gateNames = [
    'schema-validation', 'dag-acyclic', 'single-writer',
    'prd-criterion-coverage', 'entity-reference-integrity',
    'gap-resolution-completeness', 'openapi-lint',
    'migration-sql-parses', 'adr-completeness',
  ];

  const gates = gateNames.map((name) => ({
    name,
    passed: gateOverrides?.[name] ?? passed,
    findings: (gateOverrides?.[name] ?? passed) ? [] : [`${name} failed`],
  }));

  const allPassed = gates.every((g) => g.passed);

  return {
    gates,
    passed: allPassed,
    summary: allPassed ? 'All passed' : 'Some failed',
  };
}

describe('computeArchitectMetrics', () => {
  it('correct verdict when critic passes as expected', () => {
    const report = makeReport(true);
    const expected: ArchitectExpectedBehavior = { criticShouldPass: true };
    const metrics = computeArchitectMetrics('test', report, expected);

    expect(metrics.isCorrectVerdict).toBe(true);
    expect(metrics.falsePositive).toBe(false);
    expect(metrics.falseNegative).toBe(false);
    expect(metrics.criticPassed).toBe(true);
    expect(metrics.expectedPass).toBe(true);
  });

  it('correct verdict when critic fails as expected', () => {
    const report = makeReport(false);
    const expected: ArchitectExpectedBehavior = { criticShouldPass: false };
    const metrics = computeArchitectMetrics('test', report, expected);

    expect(metrics.isCorrectVerdict).toBe(true);
    expect(metrics.falsePositive).toBe(false);
    expect(metrics.falseNegative).toBe(false);
  });

  it('false positive: critic passes but should fail', () => {
    const report = makeReport(true);
    const expected: ArchitectExpectedBehavior = { criticShouldPass: false };
    const metrics = computeArchitectMetrics('test', report, expected);

    expect(metrics.isCorrectVerdict).toBe(false);
    expect(metrics.falsePositive).toBe(true);
    expect(metrics.falseNegative).toBe(false);
  });

  it('false negative: critic fails but should pass', () => {
    const report = makeReport(true, { 'dag-acyclic': false });
    const expected: ArchitectExpectedBehavior = { criticShouldPass: true };
    const metrics = computeArchitectMetrics('test', report, expected);

    expect(metrics.isCorrectVerdict).toBe(false);
    expect(metrics.falsePositive).toBe(false);
    expect(metrics.falseNegative).toBe(true);
  });

  it('includes all gate results', () => {
    const report = makeReport(true);
    const expected: ArchitectExpectedBehavior = { criticShouldPass: true };
    const metrics = computeArchitectMetrics('test', report, expected);

    expect(metrics.gateResults).toHaveLength(9);
    expect(metrics.gateResults[0].name).toBe('schema-validation');
  });
});

describe('ARCHITECT_METRIC_DEFINITIONS', () => {
  it('has 3 metric definitions', () => {
    expect(ARCHITECT_METRIC_DEFINITIONS).toHaveLength(3);
  });

  it('correct-verdict returns 1 for correct verdict', () => {
    const def = ARCHITECT_METRIC_DEFINITIONS.find((d) => d.name === 'correct-verdict')!;
    expect(def.compute({ isCorrectVerdict: true } as never)).toBe(1);
    expect(def.compute({ isCorrectVerdict: false } as never)).toBe(0);
  });

  it('false-positive-rate returns 1 for false positive', () => {
    const def = ARCHITECT_METRIC_DEFINITIONS.find((d) => d.name === 'false-positive-rate')!;
    expect(def.compute({ falsePositive: true } as never)).toBe(1);
    expect(def.compute({ falsePositive: false } as never)).toBe(0);
  });
});
