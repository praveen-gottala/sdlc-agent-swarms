import type { ClarifierMetrics } from '../types.js';
import { compareToBaseline, hasRegressions } from './compare.js';

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
    const results = compareToBaseline(BASELINE, current, 20);
    expect(hasRegressions(results)).toBe(false);
  });

  it('detects regression when metric exceeds threshold (lower-is-better)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      totalQuestions: 12,
    };
    const results = compareToBaseline(BASELINE, current, 20);
    const tqResult = results.find((r) => r.metricName === 'total-questions');
    expect(tqResult).toBeDefined();
    expect(tqResult!.regressed).toBe(true);
  });

  it('detects regression when metric drops below threshold (higher-is-better)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      prdDiffBytes: 200,
    };
    const results = compareToBaseline(BASELINE, current, 20);
    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeDefined();
    expect(prdResult!.regressed).toBe(true);
  });

  it('detects regression on prd-hash-equal boolean (false → true)', () => {
    const current: ClarifierMetrics = {
      ...BASELINE,
      prdHashEqualAcrossRounds: true,
    };
    const results = compareToBaseline(BASELINE, current, 20);
    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    expect(hashResult).toBeDefined();
    expect(hashResult!.regressed).toBe(true);
  });

  it('no regression on prd-hash-equal boolean (false → false)', () => {
    const current: ClarifierMetrics = { ...BASELINE };
    const results = compareToBaseline(BASELINE, current, 20);
    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    expect(hashResult).toBeDefined();
    expect(hashResult!.regressed).toBe(false);
  });

  it('excludes null metrics from comparison', () => {
    const baselineWithPrd: ClarifierMetrics = { ...BASELINE, prdDiffBytes: 500 };
    const currentNull: ClarifierMetrics = {
      ...BASELINE,
      prdDiffBytes: null,
      prdHashEqualAcrossRounds: null,
    };
    const results = compareToBaseline(baselineWithPrd, currentNull, 20);

    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeUndefined();

    const hashResult = results.find((r) => r.metricName === 'prd-hash-equal-across-rounds');
    expect(hashResult).toBeUndefined();

    expect(hasRegressions(results)).toBe(false);
  });

  it('both null metrics are excluded', () => {
    const baseNull: ClarifierMetrics = { ...BASELINE, prdDiffBytes: null, prdHashEqualAcrossRounds: null };
    const curNull: ClarifierMetrics = { ...BASELINE, prdDiffBytes: null, prdHashEqualAcrossRounds: null };
    const results = compareToBaseline(baseNull, curNull, 20);

    const prdResult = results.find((r) => r.metricName === 'prd-diff-bytes');
    expect(prdResult).toBeUndefined();
  });
});
