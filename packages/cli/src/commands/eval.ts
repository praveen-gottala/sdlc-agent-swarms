/**
 * @module @agentforge/cli/commands/eval
 *
 * The `agentforge eval clarifier` command.
 * Runs eval scenarios against the clarifier pipeline, computes metrics,
 * and optionally compares against a baseline for regression detection.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';
import {
  loadScenarios,
  loadScenario,
  runScenario,
  createRecordingProvider,
  clearCassette,
  compareToBaseline,
  buildReport,
  renderMarkdown,
  renderJson,
  CLARIFIER_METRIC_DEFINITIONS,
} from '@agentforge/eval';
import type { ClarifierMetrics, ClarifierEvalScenario, RegressionResult } from '@agentforge/eval';
import type { LLMProvider } from '@agentforge/providers';

export interface EvalCommandOptions {
  readonly scenario?: string;
  readonly baseline?: boolean;
  readonly record?: boolean;
  readonly replay?: boolean;
  readonly output?: 'text' | 'json';
  readonly threshold?: string;
  readonly cassetteDir?: string;
}

/**
 * Execute the eval command.
 */
export async function evalCommand(
  options: EvalCommandOptions,
  rootDir: string,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const scenarios = options.scenario
    ? [loadScenario(options.scenario)].filter((s): s is ClarifierEvalScenario => s !== undefined)
    : loadScenarios();

  if (scenarios.length === 0) {
    output.write(`No scenario found for id: ${options.scenario}\n`);
    process.exitCode = 1;
    return;
  }

  const provider = createEvalProvider(options, rootDir);
  if (!provider) {
    output.write('No Claude API authentication configured. Set ANTHROPIC_API_KEY.\n');
    process.exitCode = 1;
    return;
  }

  const thresholdPct = options.threshold ? parseInt(options.threshold, 10) : 20;
  const baselinePath = join(rootDir, '.agentforge', 'eval', 'baseline.json');
  const baseline = loadBaseline(baselinePath);

  const scenarioResults: { scenarioId: string; metrics: ClarifierMetrics; regressions: readonly RegressionResult[] }[] = [];
  let failedCount = 0;

  for (const scenario of scenarios) {
    output.write(`Running scenario: ${scenario.id}...\n`);
    const result = await runScenario(scenario, provider, undefined, (msg) => output.write(msg + '\n'));

    if (!result.ok) {
      output.write(`  ERROR: ${result.error.code} — ${result.error.message}\n`);
      failedCount++;
      continue;
    }

    const metrics = result.value;
    output.write(`  totalQuestions: ${metrics.totalQuestions}\n`);
    output.write(`  roundCount: ${metrics.roundCount}\n`);
    output.write(`  gapOverlapRatio: ${metrics.gapOverlapRatio.toFixed(2)}\n`);
    output.write(`  prdDiffBytes: ${metrics.prdDiffBytes ?? 'n/a'}\n`);
    output.write(`  prdHashEqual: ${metrics.prdHashEqualAcrossRounds ?? 'n/a'}\n`);
    output.write(`  totalCostUsd: $${metrics.totalCostUsd.toFixed(4)}\n`);
    output.write(`  durationMs: ${metrics.durationMs}\n`);

    const scenarioBaseline = baseline?.find((b) => b.scenarioId === scenario.id);
    const regressions = scenarioBaseline
      ? compareToBaseline(scenarioBaseline, metrics, thresholdPct, CLARIFIER_METRIC_DEFINITIONS)
      : [];

    scenarioResults.push({ scenarioId: scenario.id, metrics, regressions });
  }

  const report = buildReport(scenarioResults);

  if (options.output === 'json') {
    output.write(renderJson(report) + '\n');
  } else {
    output.write('\n' + renderMarkdown(report) + '\n');
  }

  // Save results
  const evalDir = join(rootDir, '.agentforge', 'eval');
  mkdirSync(evalDir, { recursive: true });
  writeFileSync(
    join(evalDir, `eval-report-${Date.now()}.json`),
    renderJson(report),
  );

  if (options.baseline) {
    const baselineData = scenarioResults.map((s) => s.metrics);
    writeFileSync(baselinePath, JSON.stringify(baselineData, null, 2));
    output.write(`\nBaseline saved to ${baselinePath}\n`);
  }

  if (report.hasRegressions || failedCount > 0) {
    if (failedCount > 0) {
      output.write(`\n${failedCount} scenario(s) failed.\n`);
    }
    process.exitCode = 1;
  }
}

function createEvalProvider(
  options: EvalCommandOptions,
  rootDir: string,
): LLMProvider | null {
  if (options.replay) {
    const cassetteDir = options.cassetteDir ?? join(rootDir, '.agentforge', 'eval', 'cassettes');
    return createRecordingProvider({
      mode: 'replay',
      cassettePath: join(cassetteDir, 'all.jsonl'),
    });
  }

  const auth = resolveClaudeAuth();
  if (!auth) return null;

  const config = authResultToProviderConfig(auth);
  const claude = createClaudeProvider('claude-sonnet-4-6', config);

  if (options.record) {
    const cassetteDir = options.cassetteDir ?? join(rootDir, '.agentforge', 'eval', 'cassettes');
    const cassettePath = join(cassetteDir, 'all.jsonl');
    clearCassette(cassettePath);
    return createRecordingProvider({
      mode: 'record',
      cassettePath,
      innerProvider: claude,
    });
  }

  return claude;
}

function loadBaseline(path: string): ClarifierMetrics[] | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ClarifierMetrics[];
  } catch {
    return null;
  }
}
