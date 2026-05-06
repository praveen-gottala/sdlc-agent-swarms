/**
 * @module @agentforge/eval/report
 *
 * Generate markdown and JSON reports from eval results.
 */

import type { ClarifierMetrics, RegressionResult, EvalReport, ScenarioReport, RunCostSummary } from './types.js';

/**
 * Build an EvalReport from scenario results and regression checks.
 */
export function buildReport(
  scenarioResults: readonly { scenarioId: string; metrics: ClarifierMetrics; regressions: readonly RegressionResult[] }[],
): EvalReport {
  const totalCost: RunCostSummary = {
    totalCostUsd: scenarioResults.reduce((sum, s) => sum + s.metrics.totalCostUsd, 0),
    totalInputTokens: 0,
    totalOutputTokens: 0,
    callCount: 0,
  };

  return {
    timestamp: new Date().toISOString(),
    scenarios: scenarioResults.map((s): ScenarioReport => ({
      scenarioId: s.scenarioId,
      metrics: s.metrics,
      regressions: [...s.regressions],
    })),
    totalCost,
    hasRegressions: scenarioResults.some((s) => s.regressions.some((r) => r.regressed)),
  };
}

/**
 * Render an EvalReport as markdown for terminal output.
 */
export function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [
    '# Clarifier Eval Report',
    '',
    `Timestamp: ${report.timestamp}`,
    `Total cost: $${report.totalCost.totalCostUsd.toFixed(4)}`,
    '',
  ];

  for (const scenario of report.scenarios) {
    lines.push(`## ${scenario.scenarioId}`);
    lines.push('');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| total-questions | ${scenario.metrics.totalQuestions} |`);
    lines.push(`| round-count | ${scenario.metrics.roundCount} |`);
    lines.push(`| gap-overlap-ratio | ${scenario.metrics.gapOverlapRatio.toFixed(2)} |`);
    lines.push(`| prd-diff-bytes | ${scenario.metrics.prdDiffBytes ?? 'n/a'} |`);
    lines.push(`| prd-hash-equal | ${scenario.metrics.prdHashEqualAcrossRounds ?? 'n/a'} |`);
    lines.push(`| total-cost-usd | $${scenario.metrics.totalCostUsd.toFixed(4)} |`);
    lines.push(`| duration-ms | ${scenario.metrics.durationMs} |`);
    lines.push('');

    if (scenario.regressions.length > 0) {
      lines.push('### Regression checks');
      lines.push('');
      for (const r of scenario.regressions) {
        const icon = r.regressed ? 'REGRESSION' : 'ok';
        const arrow = r.deltaPct > 0 ? '↑' : r.deltaPct < 0 ? '↓' : '=';
        lines.push(`- ${r.metricName}: ${r.current} (baseline ${r.baseline}) ${arrow} ${Math.abs(r.deltaPct)}% ${icon}`);
      }
      lines.push('');
    }
  }

  if (report.hasRegressions) {
    lines.push('**Result: REGRESSIONS DETECTED — exit code 1**');
  } else {
    lines.push('**Result: all metrics within threshold**');
  }

  return lines.join('\n');
}

/**
 * Render an EvalReport as a JSON string.
 */
export function renderJson(report: EvalReport): string {
  return JSON.stringify(report, null, 2);
}
