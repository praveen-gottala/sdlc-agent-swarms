/**
 * @module @agentforge/eval/baseline/compare
 *
 * Compare current metrics against a baseline for regression detection.
 */

import type { ClarifierMetrics, MetricDefinition, RegressionResult } from '../types.js';
import { METRIC_DEFINITIONS } from '../metrics/clarifier-metrics.js';

const DEFAULT_THRESHOLD_PCT = 20;

/**
 * Compare current metrics against baseline, checking for regressions.
 * Null metrics are excluded from comparison.
 */
export function compareToBaseline(
  baseline: ClarifierMetrics,
  current: ClarifierMetrics,
  thresholdPct: number = DEFAULT_THRESHOLD_PCT,
  metricDefs: readonly MetricDefinition[] = METRIC_DEFINITIONS,
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

  // prd-hash-equal-across-rounds: boolean check
  if (baseline.prdHashEqualAcrossRounds !== null && current.prdHashEqualAcrossRounds !== null) {
    const regressed = !baseline.prdHashEqualAcrossRounds && current.prdHashEqualAcrossRounds;
    results.push({
      metricName: 'prd-hash-equal-across-rounds',
      direction: 'lower-is-better',
      baseline: baseline.prdHashEqualAcrossRounds ? 1 : 0,
      current: current.prdHashEqualAcrossRounds ? 1 : 0,
      regressed,
      deltaPct: regressed ? 100 : 0,
    });
  }

  return results;
}

/** Check if any regressions exist in the results. */
export function hasRegressions(results: readonly RegressionResult[]): boolean {
  return results.some((r) => r.regressed);
}
