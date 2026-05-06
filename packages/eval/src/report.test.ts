import type { ClarifierMetrics } from './types.js';
import { buildReport, renderMarkdown, renderJson } from './report.js';

const METRICS: ClarifierMetrics = {
  scenarioId: 'pomodoro',
  threadId: 'test-thread',
  totalQuestions: 7,
  roundCount: 2,
  gapOverlapRatio: 0.1,
  prdDiffBytes: 500,
  prdHashEqualAcrossRounds: false,
  totalCostUsd: 0.42,
  durationMs: 15000,
};

describe('buildReport', () => {
  it('creates report with correct structure', () => {
    const report = buildReport([
      { scenarioId: 'pomodoro', metrics: METRICS, regressions: [] },
    ]);
    expect(report.timestamp).toBeDefined();
    expect(report.scenarios).toHaveLength(1);
    expect(report.hasRegressions).toBe(false);
    expect(report.totalCost.totalCostUsd).toBeCloseTo(0.42);
  });

  it('detects regressions in report', () => {
    const report = buildReport([
      {
        scenarioId: 'pomodoro',
        metrics: METRICS,
        regressions: [{
          metricName: 'total-cost-usd',
          direction: 'lower-is-better',
          baseline: 0.3,
          current: 0.42,
          regressed: true,
          deltaPct: 40,
        }],
      },
    ]);
    expect(report.hasRegressions).toBe(true);
  });
});

describe('renderMarkdown', () => {
  it('renders report as markdown', () => {
    const report = buildReport([
      { scenarioId: 'pomodoro', metrics: METRICS, regressions: [] },
    ]);
    const md = renderMarkdown(report);
    expect(md).toContain('# Clarifier Eval Report');
    expect(md).toContain('pomodoro');
    expect(md).toContain('total-questions');
    expect(md).toContain('$0.4200');
    expect(md).toContain('all metrics within threshold');
  });

  it('renders null PRD metrics as n/a', () => {
    const nullMetrics: ClarifierMetrics = { ...METRICS, prdDiffBytes: null, prdHashEqualAcrossRounds: null };
    const report = buildReport([
      { scenarioId: 'escalation', metrics: nullMetrics, regressions: [] },
    ]);
    const md = renderMarkdown(report);
    expect(md).toContain('n/a');
  });
});

describe('renderJson', () => {
  it('produces valid JSON', () => {
    const report = buildReport([
      { scenarioId: 'pomodoro', metrics: METRICS, regressions: [] },
    ]);
    const json = renderJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.scenarios).toHaveLength(1);
  });
});
