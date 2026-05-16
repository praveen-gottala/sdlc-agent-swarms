/**
 * Run the Architect pipeline on the CashPulse fixture for M3.6 eval.
 *
 * Runs both greenfield (M0) and brownfield (M3.5) inputs through the
 * 7-node Architect pipeline, auto-approves Gate 2 HITL, and saves
 * all output artifacts (ScreenPlan, ComponentComposition, DataModelSpec,
 * TaskPlan, ArchitectureSpec, ADRs).
 *
 * Usage: npx tsx scripts/run-architect-cashpulse.ts [--brownfield-only] [--greenfield-only]
 *
 * Prerequisites:
 *   - nx run-many -t build
 *   - ANTHROPIC_API_KEY or Vertex AI ADC configured
 *   - M0 clarifier output at fixtures/personal-expense-tracker/agentforge/clarifier-output/
 *   - M3.5 clarifier brownfield output (for brownfield pass)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MemorySaver,
  EnrichedRequirementSchema,
  AssumptionLedgerSchema,
  ScreenPlanSchema,
  ComponentCompositionSchema,
  DataModelSpecSchema,
  TaskPlanSchema,
  ArchitectureSpecSchema,
} from '@agentforge/core';
import { runArchitectPipelineStream } from '@agentforge/agents-architect';
import type { ArchitectInput, ArchitectStreamEvent } from '@agentforge/agents-architect';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ROOT = join(ROOT, 'fixtures', 'personal-expense-tracker');
const CATALOG_PATH = join(ROOT, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml');

const GREENFIELD_INPUT_DIR = join(PROJECT_ROOT, 'agentforge', 'clarifier-output');
const BROWNFIELD_INPUT_DIR = join(PROJECT_ROOT, 'agentforge', 'clarifier-brownfield-output');
const GREENFIELD_OUTPUT_DIR = join(PROJECT_ROOT, 'agentforge', 'architect-output');
const BROWNFIELD_OUTPUT_DIR = join(PROJECT_ROOT, 'agentforge', 'architect-brownfield-output');

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

interface RunResult {
  screenPlans: readonly unknown[];
  componentCompositions: readonly unknown[];
  dataModelSpec: unknown;
  taskPlan: unknown;
  architectureSpec: unknown;
  adrs: readonly unknown[];
  threadId: string;
  durationMs: number;
}

async function runArchitectPass(
  label: string,
  inputDir: string,
  outputDir: string,
  mode: 'greenfield' | 'brownfield',
): Promise<RunResult> {
  log(`\n=== ${label} ===`);

  // 1. Load inputs
  const enrichedReqRaw = JSON.parse(readFileSync(join(inputDir, 'enriched-requirement.json'), 'utf-8'));
  const enrichedReq = EnrichedRequirementSchema.parse(enrichedReqRaw);
  log(`EnrichedRequirement loaded (${enrichedReq.prd.screens?.length ?? 0} screens, ${enrichedReq.prd.dataEntities?.length ?? 0} entities)`);

  const assumptionLedgerRaw = JSON.parse(readFileSync(join(inputDir, 'assumption-ledger.json'), 'utf-8'));
  const assumptionLedger = AssumptionLedgerSchema.parse(assumptionLedgerRaw);
  log(`AssumptionLedger loaded (${Array.isArray(assumptionLedger) ? assumptionLedger.length : (assumptionLedger as Record<string, unknown>).entries ? 'object' : 0} entries)`);

  let baseCatalog: string | undefined;
  try {
    baseCatalog = readFileSync(CATALOG_PATH, 'utf-8');
    log(`Base catalog loaded (${baseCatalog.length} chars)`);
  } catch {
    log('Base catalog not found — proceeding without it');
  }

  // 2. Set up provider
  const auth = resolveClaudeAuth();
  if (!auth) {
    throw new Error('No Claude API authentication configured. Set ANTHROPIC_API_KEY or configure Vertex AI ADC.');
  }
  const config = authResultToProviderConfig(auth);
  const provider = createClaudeProvider('claude-sonnet-4-6', config);
  log(`Provider: claude-sonnet-4-6 via ${auth.type}`);

  // 3. Run Architect pipeline
  const checkpointer = new MemorySaver();
  const threadId = `m3.6-architect-${mode}-${Date.now()}`;
  const startTime = Date.now();

  log(`Starting Architect pipeline (mode=${mode}, threadId=${threadId})...`);

  const input: ArchitectInput = {
    enrichedRequirement: enrichedReq,
    assumptionLedger,
    mode,
    provider,
    projectRoot: PROJECT_ROOT,
    projectId: `cashpulse-${mode}`,
    baseCatalog,
    threadId,
    checkpointer,
  };

  let finalState: Record<string, unknown> | undefined;
  let interrupted = false;

  // First pass
  const stream = runArchitectPipelineStream(input);
  for await (const event of stream) {
    switch (event.type) {
      case 'node-complete':
        log(`  [node] ${event.node} complete (${(event.durationMs / 1000).toFixed(1)}s)`);
        break;
      case 'interrupt':
        log(`  [interrupt] Gate 2 HITL — auto-approving for fixture generation`);
        finalState = event.state as unknown as Record<string, unknown>;
        interrupted = true;
        break;
      case 'complete':
        log(`  [complete] Pipeline finished`);
        finalState = event.state as unknown as Record<string, unknown>;
        break;
      case 'error':
        throw new Error(`Architect pipeline error: ${event.error.code} — ${event.error.message}`);
    }
  }

  // Resume from Gate 2 if interrupted
  if (interrupted && finalState) {
    log(`Resuming from Gate 2 interrupt (auto-approve)...`);
    const resumeInput: ArchitectInput = {
      ...input,
      gate2Decision: 'approved',
    };

    const resumeStream = runArchitectPipelineStream(resumeInput);
    for await (const event of resumeStream) {
      switch (event.type) {
        case 'node-complete':
          log(`  [node] ${event.node} complete (${(event.durationMs / 1000).toFixed(1)}s)`);
          break;
        case 'complete':
          log(`  [complete] Pipeline finished after Gate 2 resume`);
          finalState = event.state as unknown as Record<string, unknown>;
          break;
        case 'error':
          throw new Error(`Architect pipeline error on resume: ${event.error.code} — ${event.error.message}`);
        case 'interrupt':
          log(`  [interrupt] Unexpected second interrupt — stopping`);
          finalState = event.state as unknown as Record<string, unknown>;
          break;
      }
    }
  }

  if (!finalState) {
    throw new Error('Architect pipeline completed without producing state');
  }

  const durationMs = Date.now() - startTime;
  log(`Pipeline complete in ${(durationMs / 1000).toFixed(1)}s`);

  // 4. Extract outputs
  const screenPlans = (finalState.screenPlans ?? []) as readonly unknown[];
  const componentCompositions = (finalState.componentCompositions ?? []) as readonly unknown[];
  const dataModelSpec = finalState.dataModelSpec ?? null;
  const taskPlan = finalState.taskPlan ?? null;
  const architectureSpec = finalState.architectureSpec ?? null;
  const adrs = (finalState.adrs ?? []) as readonly unknown[];

  log(`Outputs: ${screenPlans.length} screen plans, ${componentCompositions.length} component compositions`);
  log(`         dataModel=${dataModelSpec ? 'present' : 'null'}, taskPlan=${taskPlan ? 'present' : 'null'}, architectureSpec=${architectureSpec ? 'present' : 'null'}, ${adrs.length} ADRs`);

  // 5. Save artifacts
  mkdirSync(outputDir, { recursive: true });

  const artifacts: Record<string, unknown> = {
    'screen-plans.json': screenPlans,
    'component-compositions.json': componentCompositions,
    'data-model.json': dataModelSpec,
    'task-plan.json': taskPlan,
    'architecture-spec.json': architectureSpec,
    'adrs.json': adrs,
  };

  for (const [filename, data] of Object.entries(artifacts)) {
    if (data === null || data === undefined) {
      log(`  SKIP ${filename} (null)`);
      continue;
    }
    writeFileSync(join(outputDir, filename), JSON.stringify(data, null, 2));
    log(`  SAVED ${filename}`);
  }

  const summary = {
    threadId,
    mode,
    model: 'claude-sonnet-4-6',
    durationMs,
    screenPlanCount: screenPlans.length,
    componentCompositionCount: componentCompositions.length,
    dataModelPresent: !!dataModelSpec,
    taskPlanPresent: !!taskPlan,
    architectureSpecPresent: !!architectureSpec,
    adrCount: adrs.length,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(outputDir, 'run-summary.json'), JSON.stringify(summary, null, 2));
  log(`  SAVED run-summary.json`);

  // 6. Validate outputs against schemas
  log('Validating outputs...');
  const validations: { name: string; ok: boolean; errors?: string[] }[] = [];

  for (let i = 0; i < screenPlans.length; i++) {
    const result = ScreenPlanSchema.safeParse(screenPlans[i]);
    validations.push({
      name: `ScreenPlanSchema[${i}]`,
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  for (let i = 0; i < componentCompositions.length; i++) {
    const result = ComponentCompositionSchema.safeParse(componentCompositions[i]);
    validations.push({
      name: `ComponentCompositionSchema[${i}]`,
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  if (dataModelSpec) {
    const result = DataModelSpecSchema.safeParse(dataModelSpec);
    validations.push({
      name: 'DataModelSpecSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  if (taskPlan) {
    const result = TaskPlanSchema.safeParse(taskPlan);
    validations.push({
      name: 'TaskPlanSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  if (architectureSpec) {
    const result = ArchitectureSpecSchema.safeParse(architectureSpec);
    validations.push({
      name: 'ArchitectureSpecSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  writeFileSync(join(outputDir, 'validation-report.json'), JSON.stringify(validations, null, 2));
  log(`  SAVED validation-report.json`);

  for (const v of validations) {
    const status = v.ok ? 'PASS' : 'FAIL';
    log(`  ${status} ${v.name}${v.errors ? ` — ${v.errors.length} error(s)` : ''}`);
    if (v.errors) {
      for (const e of v.errors.slice(0, 3)) {
        log(`    ${e}`);
      }
    }
  }

  return { screenPlans, componentCompositions, dataModelSpec, taskPlan, architectureSpec, adrs, threadId, durationMs };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const greenfieldOnly = args.includes('--greenfield-only');
  const brownfieldOnly = args.includes('--brownfield-only');

  log('M3.6 Architect Pipeline: CashPulse Fixture Generation');
  log('=====================================================');

  const results: { label: string; result: RunResult }[] = [];

  if (!brownfieldOnly) {
    const greenfieldResult = await runArchitectPass(
      'Greenfield (M0 baseline)',
      GREENFIELD_INPUT_DIR,
      GREENFIELD_OUTPUT_DIR,
      'greenfield',
    );
    results.push({ label: 'Greenfield', result: greenfieldResult });
  }

  if (!greenfieldOnly) {
    const brownfieldResult = await runArchitectPass(
      'Brownfield (M3.5 — Add Recurring Transactions)',
      BROWNFIELD_INPUT_DIR,
      BROWNFIELD_OUTPUT_DIR,
      'brownfield',
    );
    results.push({ label: 'Brownfield', result: brownfieldResult });
  }

  // Print combined summary
  log('\n=== Combined Summary ===');
  for (const { label, result } of results) {
    log(`\n${label}:`);
    log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    log(`  Screen plans: ${result.screenPlans.length}`);
    log(`  Component compositions: ${result.componentCompositions.length}`);
    log(`  Data model: ${result.dataModelSpec ? 'present' : 'null'}`);
    log(`  Task plan: ${result.taskPlan ? 'present' : 'null'}`);
    log(`  Architecture spec: ${result.architectureSpec ? 'present' : 'null'}`);
    log(`  ADRs: ${(result.adrs as unknown[]).length}`);
    log(`  Output: ${label === 'Greenfield' ? GREENFIELD_OUTPUT_DIR : BROWNFIELD_OUTPUT_DIR}`);

    // List screen names
    log(`  Screens:`);
    for (const sp of result.screenPlans) {
      const plan = sp as Record<string, unknown>;
      log(`    - ${plan.screenName ?? plan.screenId ?? plan.name ?? 'unnamed'} (${plan.screenType ?? 'page'})`);
    }
  }
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    log(err.stack);
  }
  process.exitCode = 1;
});
