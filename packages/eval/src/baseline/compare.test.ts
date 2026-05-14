import type { ClarifierMetrics } from '../types.js';
import { compareToBaseline, hasRegressions } from './compare.js';
import { CLARIFIER_METRIC_DEFINITIONS } from '../metrics/clarifier-metrics.js';

const BASELINE: ClarifierMetrics = {
  scenarioId: 'pomodoro',
  threadId: 'baseline-thread',
  totalQuestions: 7,
  roundCount: 2,
  gapOverlapRatio: 0.1,
  prdDiffBytes: 500,
  prdHashEqualAcrossRounds: false,
  totalCostUsd: 0.5,
  durationMs: 15000,
};

describe('compareToBaseline', () => {
  it('detects no regression within threshold', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      totalQuestions: 8,
      totalCostUsd: 0.55,
    };
    const results = compareToBaseline(BASELINE, current, 20, CLARIFIER_METRIC_DEFINITIONS);
    expect(hasRegressions(results)).toBe(false);
  });

  it('detects regression when metric exceeds threshold (lower-is-better)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      totalQuestions: 12,
    };
    const results = compareToBaseline(BASELINE, current, 20, CLARIFIER_METRIC_DEFINITIONS);
    const tqResult = results.find((r) => r.metricName === 'total-questions');
    expect(tqResult).toBeDefined();
    expect(tqResult!.regressed).toBe(true);
  });

  it('detects regression when metric drops below threshold (higher-is-better)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      prdDiffBytes: 200,
    };
    const results = compareToBaseline(BASELINE, current, 20, CLARIFIER_METRIC_DEFINITIONS);
    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeDefined();
    expect(prdResult!.regressed).toBe(true);
  });

  it('detects regression on prd-hash-equal boolean (false → true)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      prdHashEqualAcrossRounds: true,
    };
    const results = compareToBaseline(BASELINE, current, 20, CLARIFIER_METRIC_DEFINITIONS);
    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    expect(hashResult).toBeDefined();
    expect(hashResult!.regressed).toBe(true);
  });

  it('no regression on prd-hash-equal boolean (false → false)', () => {
    const current: ClarifierMetrics = { ...BASELINE };
    const results = compareToBaseline(BASELINE, current, 20, CLARIFIER_METRIC_DEFINITIONS);
    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    // Both baseline and current are false (0), so both values are 0 → skipped by the 0===0 shortcut
    expect(hashResult).toBeUndefined();
    expect(hasRegressions(results)).toBe(false);
  });

  it('excludes null metrics from comparison', () => {
    const baselineWithPrd: ClarifierMetrics = { ...BASELINE, prdDiffBytes: 500 };
    const currentNull: ClarifierMetrics = {
      ...BASELINE,
      prdDiffBytes: null,
      prdHashEqualAcrossRounds: null,
    };
    const results = compareToBaseline(baselineWithPrd, currentNull, 20, CLARIFIER_METRIC_DEFINITIONS);

    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeUndefined();

    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    expect(hashResult).toBeUndefined();

    expect(hasRegressions(results)).toBe(false);
  });

  it('both null metrics are excluded', () => {
    const baseNull: ClarifierMetrics = { ...BASELINE, prdDiffBytes: null, prdHashEqualAcrossRounds: null };
    const curNull: ClarifierMetrics = { ...BASELINE, prdDiffBytes: null, prdHashEqualAcrossRounds: null };
    const results = compareToBaseline(baseNull, curNull, 20, CLARIFIER_METRIC_DEFINITIONS);

    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeUndefined();
  });
});
