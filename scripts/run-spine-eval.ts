#!/usr/bin/env npx tsx
/**
 * @module run-spine-eval
 *
 * Full spine eval runner: Clarifier (fixture) → Architect → Implementer → Reviewer
 * on CashPulse greenfield and brownfield paths.
 *
 * Usage:
 *   RUN_LLM_TESTS=true npx tsx scripts/run-spine-eval.ts [--scenario <id>] [--reps <n>] [--dry-run]
 *
 * Cost tier: RUN_LLM_TESTS=true required. ~$1-3 per scenario run, ~$6-18 for full Phase 7 pass.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { TaskNode, ContractBundle, Diff, TaskCompletionReport, ReviewResult, BaseCheckpointSaver, EnrichedRequirement, AssumptionLedger } from '@agentforge/core';
import { MemorySaver } from '@agentforge/core';
import type { ArchitectStateType } from '@agentforge/agents-architect';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import type { LLMProvider } from '@agentforge/providers';
import { createTracedProvider, initLangfuseTracing } from '@agentforge/telemetry';
import { createRecordingProvider } from '@agentforge/eval';
import type { RecordingProvider, RunCostSummary, SpineEvalScenario, SpineEvalResult, SpineStageCost } from '@agentforge/eval';
import { loadSpineScenarios, loadSpineScenario } from '@agentforge/eval';
import { runArchitectPipelineStream } from '@agentforge/agents-architect';
import type { ArchitectStreamEvent } from '@agentforge/agents-architect';
import { runImplementerPipelineStream } from '@agentforge/agents-implementer';
import type { ImplementerStreamEvent } from '@agentforge/agents-implementer';
import { runReviewerPipelineStream } from '@agentforge/agents-reviewer';
import type { ReviewerStreamEvent } from '@agentforge/agents-reviewer';

const PROJECT_ROOT = resolve(join(import.meta.dirname ?? '.', '..'));
const RESULTS_DIR = join(PROJECT_ROOT, 'packages', 'eval', 'results', 'm4');
const SCENARIOS_DIR = join(PROJECT_ROOT, 'packages', 'eval', 'src', 'scenarios');

// ── CLI args ─────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    scenario: { type: 'string', short: 's' },
    reps: { type: 'string', short: 'r', default: '1' },
    'dry-run': { type: 'boolean', default: false },
  },
  strict: true,
});

const reps = parseInt(args.reps ?? '1', 10);
const dryRun = args['dry-run'] ?? false;

// ── Gate check ───────────────────────────────────────────────────────

if (!dryRun && process.env.RUN_LLM_TESTS !== 'true') {
  console.error('Error: Set RUN_LLM_TESTS=true to run spine eval (incurs LLM costs).');
  process.exit(1);
}

// ── Helpers ──────────────────────────────────────────────────────────

function loadFixtureJson<T>(relativePath: string): T {
  const fullPath = join(PROJECT_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`Fixture not found: ${fullPath}`);
  }
  return JSON.parse(readFileSync(fullPath, 'utf-8')) as T;
}

function createStageCassettePath(stage: string, scenarioId: string, rep: number): string {
  return join(RESULTS_DIR, `cassette-${scenarioId}-rep${rep}-${stage}.jsonl`);
}

function createStageRecorder(
  stage: string,
  scenarioId: string,
  rep: number,
  innerProvider: LLMProvider,
): RecordingProvider {
  return createRecordingProvider({
    mode: 'record',
    cassettePath: createStageCassettePath(stage, scenarioId, rep),
    innerProvider,
  });
}

function selectTask(
  tasks: readonly TaskNode[],
  selector: SpineEvalScenario['architect']['taskSelector'],
): TaskNode | undefined {
  switch (selector.mode) {
    case 'first':
      return tasks[0];
    case 'by-id':
      return tasks.find((t) => t.id === selector.taskId);
    case 'by-type':
      return tasks.find((t) => {
        const typeMatch = !selector.taskType || t.type === selector.taskType;
        const modeMatch = !selector.taskMode || t.mode === selector.taskMode;
        return typeMatch && modeMatch;
      });
    default:
      return tasks[0];
  }
}

function buildDiffFromArtifacts(
  artifacts: readonly { path: string; action: string }[],
  taskId: string,
): Diff {
  return {
    id: `eval-diff-${taskId}`,
    taskId,
    worktreeBranch: `eval-${taskId}`,
    files: artifacts.map((a) => ({
      path: a.path,
      operation: a.action === 'created' ? 'add' as const : 'modify' as const,
      hunks: [],
    })),
    testsPassed: true,
    typecheckPassed: true,
    lintPassed: true,
  };
}

function log(msg: string): void {
  console.log(`[spine-eval] ${msg}`);
}

// ── Stage runners ────────────────────────────────────────────────────

interface ArchitectResult {
  contractBundle: Partial<ContractBundle>;
  taskPlan: { tasks: TaskNode[] };
  threadId: string;
  cost: RunCostSummary;
  durationMs: number;
}

async function runArchitectStage(
  scenario: SpineEvalScenario,
  enrichedRequirement: EnrichedRequirement,
  assumptionLedger: AssumptionLedger,
  provider: LLMProvider,
  rep: number,
): Promise<ArchitectResult> {
  const recorder = createStageRecorder('architect', scenario.id, rep, provider);
  const startMs = Date.now();

  log(`  [architect] Starting (mode=${scenario.architect.mode})...`);

  const checkpointer: BaseCheckpointSaver = new MemorySaver();

  let architectState: ArchitectStateType | undefined;
  let threadId = '';
  const eventTypes: string[] = [];

  for await (const event of runArchitectPipelineStream({
    enrichedRequirement,
    assumptionLedger,
    mode: scenario.architect.mode,
    provider: recorder,
    projectRoot: PROJECT_ROOT,
    projectId: 'spine-eval',
    checkpointer,
  })) {
    eventTypes.push(event.type);
    switch (event.type) {
      case 'node-complete':
        log(`  [architect:${event.node}] ${(event.durationMs / 1000).toFixed(1)}s`);
        break;
      case 'interrupt':
        log('  [architect] Gate 2 interrupt — using interrupt state (auto-approve, no resume needed).');
        architectState = event.state as ArchitectStateType;
        threadId = event.threadId;
        break;
      case 'complete':
        log('  [architect] Pipeline complete.');
        architectState = event.state as ArchitectStateType;
        threadId = event.threadId;
        break;
      case 'error':
        throw new Error(`Architect error: ${event.error.code} — ${event.error.message}`);
    }
  }

  log(`  [architect] Event sequence: ${eventTypes.join(' → ')}`);

  if (!architectState) {
    throw new Error('Architect did not produce a complete state');
  }

  const durationMs = Date.now() - startMs;
  const cost = recorder.getCostSummary();
  log(`  [architect] Done in ${(durationMs / 1000).toFixed(1)}s, $${cost.totalCostUsd.toFixed(4)}`);

  return {
    contractBundle: architectState as unknown as Partial<ContractBundle>,
    taskPlan: architectState.taskPlan ?? { projectId: 'spine-eval', tasks: [], featureCoverage: {} },
    threadId,
    cost,
    durationMs,
  };
}

interface ImplementerResult {
  artifacts: readonly { path: string; action: string }[];
  completionReport: TaskCompletionReport | undefined;
  cost: RunCostSummary;
  durationMs: number;
}

async function runImplementerStage(
  scenario: SpineEvalScenario,
  task: TaskNode,
  contractBundle: Partial<ContractBundle>,
  provider: LLMProvider,
  rep: number,
): Promise<ImplementerResult> {
  const recorder = createStageRecorder('implementer', scenario.id, rep, provider);
  const startMs = Date.now();

  // Create isolated temp directory for implementer file writes
  const tempRoot = mkdtempSync(join(tmpdir(), 'spine-eval-'));
  log(`  [implementer] Starting task=${task.id} type=${task.type} mode=${task.mode}`);
  log(`  [implementer] Temp root: ${tempRoot}`);

  let artifacts: readonly { path: string; action: string }[] = [];
  let completionReport: TaskCompletionReport | undefined;
  const checkpointer: BaseCheckpointSaver = new MemorySaver();

  for await (const event of runImplementerPipelineStream({
    task,
    contractBundle,
    provider: recorder,
    projectRoot: tempRoot,
    projectId: 'spine-eval',
    checkpointer,
  })) {
    switch (event.type) {
      case 'node-complete':
        log(`  [implementer:${event.node}] ${(event.durationMs / 1000).toFixed(1)}s`);
        break;
      case 'complete':
        artifacts = (event.state.artifacts ?? []) as readonly { path: string; action: string }[];
        completionReport = event.state.completionReport ?? undefined;
        break;
      case 'error':
        throw new Error(`Implementer error: ${event.error.code} — ${event.error.message}`);
    }
  }

  const durationMs = Date.now() - startMs;
  const cost = recorder.getCostSummary();
  log(`  [implementer] Done in ${(durationMs / 1000).toFixed(1)}s, $${cost.totalCostUsd.toFixed(4)}, ${artifacts.length} artifacts`);

  return { artifacts, completionReport, cost, durationMs };
}

interface ReviewerResult {
  reviewResult: ReviewResult;
  cost: RunCostSummary;
  durationMs: number;
}

async function runReviewerStage(
  scenario: SpineEvalScenario,
  diff: Diff,
  completionReport: TaskCompletionReport | undefined,
  provider: LLMProvider,
  rep: number,
): Promise<ReviewerResult> {
  const recorder = createStageRecorder('reviewer', scenario.id, rep, provider);
  const startMs = Date.now();

  log('  [reviewer] Starting...');

  let reviewResult: ReviewResult | undefined;
  const checkpointer: BaseCheckpointSaver = new MemorySaver();

  for await (const event of runReviewerPipelineStream({
    diff,
    taskCompletionReport: completionReport,
    provider: recorder,
    projectRoot: PROJECT_ROOT,
    projectId: 'spine-eval',
    checkpointer,
  })) {
    switch (event.type) {
      case 'node-complete':
        log(`  [reviewer:${event.node}] ${(event.durationMs / 1000).toFixed(1)}s`);
        break;
      case 'complete':
        reviewResult = event.reviewResult;
        break;
      case 'error':
        throw new Error(`Reviewer error: ${event.error.code} — ${event.error.message}`);
    }
  }

  if (!reviewResult) {
    throw new Error('Reviewer did not produce a ReviewResult');
  }

  const durationMs = Date.now() - startMs;
  const cost = recorder.getCostSummary();
  log(`  [reviewer] Done in ${(durationMs / 1000).toFixed(1)}s, $${cost.totalCostUsd.toFixed(4)}, outcome=${reviewResult.outcome}`);

  return { reviewResult, cost, durationMs };
}

// ── Main runner ──────────────────────────────────────────────────────

async function runSpineScenario(
  scenario: SpineEvalScenario,
  provider: LLMProvider,
  rep: number,
): Promise<SpineEvalResult> {
  const startMs = Date.now();
  const stageCosts: SpineStageCost[] = [];

  log(`\n${'='.repeat(60)}`);
  log(`Scenario: ${scenario.name} (rep ${rep + 1})`);
  log(`Path: ${scenario.path}, Architect mode: ${scenario.architect.mode}`);
  log(`${'='.repeat(60)}`);

  try {
    // Stage 1: Load Clarifier fixture (no LLM cost)
    log('\n--- Stage 1: Clarifier (fixture) ---');
    const enrichedRequirement = loadFixtureJson<EnrichedRequirement>(
      scenario.clarifier.fixtureEnrichedRequirementPath,
    );
    const assumptionLedger: AssumptionLedger = scenario.clarifier.fixtureAssumptionLedgerPath
      ? loadFixtureJson<AssumptionLedger>(scenario.clarifier.fixtureAssumptionLedgerPath)
      : { assumptions: [] };
    log('  Loaded enriched requirement + assumption ledger from fixtures.');
    stageCosts.push({
      stage: 'clarifier',
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    });

    // Stage 2: Architect (live LLM)
    log('\n--- Stage 2: Architect ---');
    const architectResult = await runArchitectStage(
      scenario, enrichedRequirement, assumptionLedger, provider, rep,
    );
    stageCosts.push({
      stage: 'architect',
      costUsd: architectResult.cost.totalCostUsd,
      inputTokens: architectResult.cost.totalInputTokens,
      outputTokens: architectResult.cost.totalOutputTokens,
      durationMs: architectResult.durationMs,
    });

    // Select task from TaskPlan
    const task = selectTask(architectResult.taskPlan.tasks, scenario.architect.taskSelector);
    if (!task) {
      const available = architectResult.taskPlan.tasks
        .map((t) => `${t.id} (type=${t.type}, mode=${t.mode})`)
        .join(', ');
      throw new Error(
        `No task matching selector ${JSON.stringify(scenario.architect.taskSelector)}. ` +
        `Available: ${available || 'none'}`,
      );
    }
    log(`\n  Selected task: ${task.id} — ${task.title} (type=${task.type}, mode=${task.mode})`);

    // Stage 3: Implementer (live LLM)
    log('\n--- Stage 3: Implementer ---');
    const implResult = await runImplementerStage(
      scenario, task, architectResult.contractBundle, provider, rep,
    );
    stageCosts.push({
      stage: 'implementer',
      costUsd: implResult.cost.totalCostUsd,
      inputTokens: implResult.cost.totalInputTokens,
      outputTokens: implResult.cost.totalOutputTokens,
      durationMs: implResult.durationMs,
    });

    // Stage 4: Reviewer (live LLM)
    log('\n--- Stage 4: Reviewer ---');
    const diff = buildDiffFromArtifacts(implResult.artifacts, task.id);
    const reviewResult = await runReviewerStage(
      scenario, diff, implResult.completionReport, provider, rep,
    );
    stageCosts.push({
      stage: 'reviewer',
      costUsd: reviewResult.cost.totalCostUsd,
      inputTokens: reviewResult.cost.totalInputTokens,
      outputTokens: reviewResult.cost.totalOutputTokens,
      durationMs: reviewResult.durationMs,
    });

    const totalCostUsd = stageCosts.reduce((sum, s) => sum + s.costUsd, 0);
    const totalDurationMs = Date.now() - startMs;

    log(`\n--- Result: SUCCESS ---`);
    log(`  Review outcome: ${reviewResult.reviewResult.outcome}`);
    log(`  Total cost: $${totalCostUsd.toFixed(4)}`);
    log(`  Total duration: ${(totalDurationMs / 1000).toFixed(1)}s`);

    return {
      scenarioId: scenario.id,
      rep,
      path: scenario.path,
      status: 'success',
      reviewOutcome: reviewResult.reviewResult.outcome,
      stageCosts,
      totalCostUsd,
      totalDurationMs,
      taskId: task.id,
      timestamp: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const totalCostUsd = stageCosts.reduce((sum, s) => sum + s.costUsd, 0);
    const totalDurationMs = Date.now() - startMs;

    log(`\n--- Result: FAILED ---`);
    log(`  Error: ${message}`);
    log(`  Cost incurred: $${totalCostUsd.toFixed(4)}`);

    return {
      scenarioId: scenario.id,
      rep,
      path: scenario.path,
      status: 'failed',
      stageCosts,
      totalCostUsd,
      totalDurationMs,
      error: message,
      timestamp: new Date().toISOString(),
    };
  }
}

// ── Entry point ──────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('M4 Phase 7: Full Spine Eval');
  log(`Reps: ${reps}, Dry run: ${dryRun}`);

  // Load scenarios
  const allScenarios = loadSpineScenarios(SCENARIOS_DIR);
  const scenarios = args.scenario
    ? allScenarios.filter((s) => s.id === args.scenario)
    : [...allScenarios];

  if (scenarios.length === 0) {
    console.error(`No scenarios found${args.scenario ? ` matching "${args.scenario}"` : ''}.`);
    console.error(`Available: ${allScenarios.map((s) => s.id).join(', ')}`);
    process.exit(1);
  }

  log(`Scenarios: ${scenarios.map((s) => s.id).join(', ')}`);

  if (dryRun) {
    log('\n--- DRY RUN: Verifying fixtures ---');
    for (const scenario of scenarios) {
      try {
        loadFixtureJson(scenario.clarifier.fixtureEnrichedRequirementPath);
        log(`  [OK] ${scenario.id}: enriched-requirement fixture found`);
        if (scenario.clarifier.fixtureAssumptionLedgerPath) {
          loadFixtureJson(scenario.clarifier.fixtureAssumptionLedgerPath);
          log(`  [OK] ${scenario.id}: assumption-ledger fixture found`);
        }
        if (scenario.architect.existingDesignSpecPaths) {
          for (const [screenId, path] of Object.entries(scenario.architect.existingDesignSpecPaths)) {
            loadFixtureJson(path);
            log(`  [OK] ${scenario.id}: design spec ${screenId} found`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`  [FAIL] ${scenario.id}: ${msg}`);
      }
    }
    log('\nDry run complete. No LLM calls made.');
    return;
  }

  // Authenticate
  const auth = resolveClaudeAuth();
  if (!auth) {
    console.error('Error: No Claude API authentication configured.');
    process.exit(1);
  }

  initLangfuseTracing();

  const model = 'claude-opus-4-6';
  const authConfig = authResultToProviderConfig(auth);
  const baseProvider = createTracedProvider(createClaudeProvider(model, authConfig));

  // Ensure results directory exists
  mkdirSync(RESULTS_DIR, { recursive: true });

  // Run scenarios
  const results: SpineEvalResult[] = [];

  for (const scenario of scenarios) {
    for (let rep = 0; rep < reps; rep++) {
      const result = await runSpineScenario(scenario, baseProvider, rep);
      results.push(result);
    }
  }

  // Load existing results and merge (append new, avoid overwriting prior runs)
  const resultsPath = join(RESULTS_DIR, 'spine-eval-results.json');
  const existing: SpineEvalResult[] = existsSync(resultsPath)
    ? JSON.parse(readFileSync(resultsPath, 'utf-8'))
    : [];
  const merged = [
    ...existing.filter((e) => !results.some((r) => r.scenarioId === e.scenarioId && r.rep === e.rep)),
    ...results,
  ];
  writeFileSync(resultsPath, JSON.stringify(merged, null, 2));
  log(`\nResults written to ${resultsPath} (${merged.length} total, ${results.length} new)`);

  // Write cost receipts (all merged results)
  writeCostReceipts(merged);

  // Check failure rate
  const totalRuns = results.length;
  const failures = results.filter((r) => r.status === 'failed').length;
  const failureRate = totalRuns > 0 ? failures / totalRuns : 0;

  log(`\n${'='.repeat(60)}`);
  log('SUMMARY');
  log(`${'='.repeat(60)}`);
  log(`Total runs: ${totalRuns}`);
  log(`Successes: ${totalRuns - failures}`);
  log(`Failures: ${failures}`);
  log(`Failure rate: ${(failureRate * 100).toFixed(1)}%`);
  log(`Total cost: $${results.reduce((s, r) => s + r.totalCostUsd, 0).toFixed(4)}`);

  if (failureRate > 0.2) {
    log('\nSTOP: Failure rate > 20%. Do not declare M4 complete on partial data.');
    process.exit(1);
  }

  log('\nGate 6a: PASSED');
}

function writeCostReceipts(results: SpineEvalResult[]): void {
  const lines: string[] = [
    '# M4 Spine Eval — Cost Receipts',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Per-Run Summary',
    '',
    '| Scenario | Rep | Status | Outcome | Cost ($) | Duration (s) |',
    '|----------|-----|--------|---------|----------|--------------|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.scenarioId} | ${r.rep + 1} | ${r.status} | ${r.reviewOutcome ?? 'n/a'} | ${r.totalCostUsd.toFixed(4)} | ${(r.totalDurationMs / 1000).toFixed(1)} |`,
    );
  }

  lines.push('');
  lines.push('## Per-Stage Breakdown');
  lines.push('');
  lines.push('| Scenario | Rep | Stage | Cost ($) | Input Tokens | Output Tokens | Duration (s) |');
  lines.push('|----------|-----|-------|----------|-------------|--------------|--------------|');

  for (const r of results) {
    for (const sc of r.stageCosts) {
      lines.push(
        `| ${r.scenarioId} | ${r.rep + 1} | ${sc.stage} | ${sc.costUsd.toFixed(4)} | ${sc.inputTokens} | ${sc.outputTokens} | ${(sc.durationMs / 1000).toFixed(1)} |`,
      );
    }
  }

  const totalCost = results.reduce((s, r) => s + r.totalCostUsd, 0);
  const totalTokensIn = results.reduce((s, r) => s + r.stageCosts.reduce((ss, sc) => ss + sc.inputTokens, 0), 0);
  const totalTokensOut = results.reduce((s, r) => s + r.stageCosts.reduce((ss, sc) => ss + sc.outputTokens, 0), 0);

  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- **Total cost:** $${totalCost.toFixed(4)}`);
  lines.push(`- **Total input tokens:** ${totalTokensIn.toLocaleString()}`);
  lines.push(`- **Total output tokens:** ${totalTokensOut.toLocaleString()}`);
  lines.push(`- **Runs:** ${results.length}`);
  lines.push(`- **Model:** claude-opus-4-6`);
  lines.push('');

  const receiptsPath = join(RESULTS_DIR, 'cost-receipts.md');
  writeFileSync(receiptsPath, lines.join('\n'));
  log(`Cost receipts written to ${receiptsPath}`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
