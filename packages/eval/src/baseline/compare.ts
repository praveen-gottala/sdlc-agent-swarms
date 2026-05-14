/**
 * @module @agentforge/eval/baseline/compare
 *
 * Compare current metrics against a baseline for regression detection.
 * Generic over metric types — works with Clarifier, Architect, or any
 * future eval domain.
 */

import type { MetricDefinition, RegressionResult } from '../types.js';

const DEFAULT_THRESHOLD_PCT = 20;

/**
 * Compare current metrics against baseline, checking for regressions.
 * Null metrics are excluded from comparison.
 */
export function compareToBaseline<TMetrics>(
  baseline: TMetrics,
  current: TMetrics,
  thresholdPct: number = DEFAULT_THRESHOLD_PCT,
  metricDefs: readonly MetricDefinition<TMetrics>[],
): readonly RegressionResult[] {
  const results: RegressionResult[] = [];

  for (const def of metricDefs) {
    const baselineVal = def.compute(baseline);
    const currentVal = def.compute(current);

    if (baselineVal === null || currentVal === null) continue;
    if (baselineVal === 0 && currentVal === 0) continue;

    const deltaPct = baselineVal === 0
      ? (currentVal > 0 ? 100 : 0)
      : ((currentVal - baselineVal) / Math.abs(baselineVal)) * 100;

    const regressed = def.direction === 'higher-is-better'
      ? deltaPct < -thresholdPct
      : deltaPct > thresholdPct;

    results.push({
      metricName: def.name,
      direction: def.direction,
      baseline: baselineVal,
      current: currentVal,
      regressed,
      deltaPct: Math.round(deltaPct * 100) / 100,
    });
  }

  return results;
}

/** Check if any regressions exist in the results. */
export function hasRegressions(results: readonly RegressionResult[]): boolean {
  return results.some((r) => r.regressed);
}
