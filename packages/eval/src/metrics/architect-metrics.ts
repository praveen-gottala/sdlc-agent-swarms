/**
 * @module @agentforge/eval/metrics/architect-metrics
 *
 * Metrics for Architect Critic accuracy evaluation.
 * Measures false-positive and false-negative rates against golden bundles.
 */

import type { CriticReport } from '@agentforge/core';
import type { ArchitectMetrics, MetricDefinition, ArchitectExpectedBehavior } from '../types.js';

/**
 * Compute Architect eval metrics from a Critic run against a scenario.
 */
export function computeArchitectMetrics(
  scenarioId: string,
  criticReport: CriticReport,
  expectedBehavior: ArchitectExpectedBehavior,
): ArchitectMetrics {
  const criticPassed = criticReport.passed;
  const expectedPass = expectedBehavior.criticShouldPass;
  const isCorrectVerdict = criticPassed === expectedPass;
  const falsePositive = !expectedPass && criticPassed;
  const falseNegative = expectedPass && !criticPassed;

  return {
    scenarioId,
    criticPassed,
    expectedPass,
    isCorrectVerdict,
    gateResults: criticReport.gates.map((g) => ({
      name: g.name,
      passed: g.passed,
      findings: [...g.findings],
    })),
    falsePositive,
    falseNegative,
  };
}

/** Architect metric definitions for regression detection. */
export const ARCHITECT_METRIC_DEFINITIONS: readonly MetricDefinition<ArchitectMetrics>[] = [
  {
    name: 'correct-verdict',
    direction: 'higher-is-better',
    compute: (m) => m.isCorrectVerdict ? 1 : 0,
  },
  {
    name: 'false-positive-rate',
    direction: 'lower-is-better',
    compute: (m) => m.falsePositive ? 1 : 0,
  },
  {
    name: 'false-negative-rate',
    direction: 'lower-is-better',
    compute: (m) => m.falseNegative ? 1 : 0,
  },
];
