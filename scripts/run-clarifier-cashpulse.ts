/**
 * M0 Ground Truth: Run the Clarifier on the CashPulse PRD.
 *
 * Runs the 9-node Clarifier pipeline in bootstrap mode (max 1 round),
 * handles HITL interrupts with the cooperative simulator, and saves
 * all output artifacts for the M0 gap analysis.
 *
 * Usage: npx tsx scripts/run-clarifier-cashpulse.ts
 *
 * Prerequisites:
 *   - nx run-many -t build
 *   - ANTHROPIC_API_KEY or Vertex AI ADC configured
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemorySaver, EnrichedRequirementSchema, FeaturePlanSchema, PRDSchema, AssumptionLedgerSchema } from '@agentforge/core';
import { compileClarifierGraph } from '@agentforge/agents-clarifier';
import type { ClarifierDeps, ClarifierState } from '@agentforge/agents-clarifier';
import { resolveClaudeAuth, authResultToProviderConfig, createClaudeProvider } from '@agentforge/providers';
import { simulateCooperativeAnswers } from '@agentforge/eval';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRD_PATH = join(ROOT, 'fixtures', 'personal-expense-tracker', 'docs', 'prd.md');
const OUTPUT_DIR = join(ROOT, 'fixtures', 'personal-expense-tracker', 'agentforge', 'clarifier-output');
const CATALOG_PATH = join(ROOT, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml');

const MAX_ROUNDS = 1;
const MAX_RESUME_CYCLES = 5;

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

async function main(): Promise<void> {
  log('M0 Ground Truth: Clarifier on CashPulse PRD');

  // 1. Read inputs
  const rawInput = readFileSync(PRD_PATH, 'utf-8');
  log(`PRD loaded (${rawInput.length} chars, ${rawInput.split('\n').length} lines)`);

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
    log('ERROR: No Claude API authentication configured.');
    log('Set ANTHROPIC_API_KEY or configure Vertex AI ADC.');
    process.exitCode = 1;
    return;
  }
  const config = authResultToProviderConfig(auth);
  const provider = createClaudeProvider('claude-sonnet-4-6', config);
  log(`Provider: claude-sonnet-4-6 via ${auth.type}`);

  // 3. Compile graph
  const checkpointer = new MemorySaver();
  const threadId = `m0-cashpulse-${Date.now()}`;
  const projectId = `m0-cashpulse`;
  const projectRoot = join(ROOT, 'fixtures', 'personal-expense-tracker');

  const deps: ClarifierDeps = { provider, projectRoot, projectId, baseCatalog };
  const compiled = compileClarifierGraph(deps, checkpointer);
  const graphConfig = { configurable: { thread_id: threadId } };

  log(`Graph compiled (threadId: ${threadId})`);

  // 4. Run bootstrap mode
  const startTime = Date.now();
  log(`Starting pipeline (bootstrap, maxRounds=${MAX_ROUNDS})...`);

  const stream = await compiled.stream(
    { rawInput, mode: 'bootstrap' as const, maxRounds: MAX_ROUNDS, threadId },
    { ...graphConfig, streamMode: 'updates' as const },
  );

  for await (const update of stream) {
    const nodeNames = Object.keys(update as Record<string, unknown>);
    for (const node of nodeNames) {
      if (node === '__interrupt__') continue;
      log(`  [node] ${node} complete`);
    }
  }

  // 5. Handle interrupt/resume loop
  let graphState = await compiled.getState(graphConfig);
  let interrupted = (graphState.next?.length ?? 0) > 0;
  let cycle = 0;

  while (interrupted && cycle < MAX_RESUME_CYCLES) {
    const state = graphState.values as ClarifierState;
    const questions = state.questions;
    log(`Interrupt: ${questions.length} questions (round ${state.round})`);

    const humanResponses = simulateCooperativeAnswers(questions);
    log(`Simulated ${humanResponses.length} cooperative answers`);

    const escalationDecision = state.round >= state.maxRounds ? 'accept' as const : undefined;
    if (escalationDecision) {
      log(`Escalation: round ${state.round} >= maxRounds ${state.maxRounds}, accepting`);
    }

    const stateUpdate: Record<string, unknown> = { humanResponses };
    if (escalationDecision) {
      stateUpdate.escalationDecision = escalationDecision;
    }

    await compiled.updateState(graphConfig, stateUpdate);
    const resumeStream = await compiled.stream(null, { ...graphConfig, streamMode: 'updates' as const });

    for await (const update of resumeStream) {
      const nodeNames = Object.keys(update as Record<string, unknown>);
      for (const node of nodeNames) {
        if (node === '__interrupt__') continue;
        log(`  [node] ${node} complete`);
      }
    }

    graphState = await compiled.getState(graphConfig);
    interrupted = (graphState.next?.length ?? 0) > 0;
    cycle++;
  }

  const durationMs = Date.now() - startTime;
  const finalState = graphState.values as ClarifierState;
  log(`Pipeline complete in ${(durationMs / 1000).toFixed(1)}s (${cycle} resume cycles)`);

  // 6. Save artifacts
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const artifacts: Record<string, unknown> = {
    'prd-draft.json': finalState.prdDraft,
    'feature-plan.json': finalState.featurePlan,
    'assumption-ledger.json': finalState.assumptions,
    'questions.json': finalState.questions,
    'human-responses.json': finalState.humanResponses,
    'gaps.json': finalState.gaps,
    'context.json': finalState.context,
    'enriched-requirement.json': finalState.requirement,
  };

  for (const [filename, data] of Object.entries(artifacts)) {
    if (data === null || data === undefined) {
      log(`  SKIP ${filename} (null)`);
      continue;
    }
    writeFileSync(join(OUTPUT_DIR, filename), JSON.stringify(data, null, 2));
    log(`  SAVED ${filename}`);
  }

  // Save summary metadata
  const summary = {
    threadId,
    mode: 'bootstrap',
    maxRounds: MAX_ROUNDS,
    actualRounds: finalState.round,
    totalQuestions: finalState.questions.length,
    totalAnswers: finalState.humanResponses.length,
    criticPassed: finalState.criticPassed,
    criticRetries: finalState.criticRetries,
    error: finalState.error,
    durationMs,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(join(OUTPUT_DIR, 'run-summary.json'), JSON.stringify(summary, null, 2));
  log('  SAVED run-summary.json');

  // 7. Validate against schemas
  log('Validating outputs...');
  const validations: { name: string; ok: boolean; errors?: string[] }[] = [];

  if (finalState.prdDraft) {
    const result = PRDSchema.safeParse(finalState.prdDraft);
    validations.push({
      name: 'PRDSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  } else {
    validations.push({ name: 'PRDSchema', ok: false, errors: ['prdDraft is null'] });
  }

  if (finalState.featurePlan) {
    const result = FeaturePlanSchema.safeParse(finalState.featurePlan);
    validations.push({
      name: 'FeaturePlanSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  } else {
    validations.push({ name: 'FeaturePlanSchema', ok: false, errors: ['featurePlan is null'] });
  }

  if (finalState.requirement) {
    const result = EnrichedRequirementSchema.safeParse(finalState.requirement);
    validations.push({
      name: 'EnrichedRequirementSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  } else {
    validations.push({ name: 'EnrichedRequirementSchema', ok: false, errors: ['requirement is null'] });
  }

  if (finalState.assumptions) {
    const result = AssumptionLedgerSchema.safeParse(finalState.assumptions);
    validations.push({
      name: 'AssumptionLedgerSchema',
      ok: result.success,
      errors: result.success ? undefined : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  } else {
    validations.push({ name: 'AssumptionLedgerSchema', ok: false, errors: ['assumptions is null'] });
  }

  writeFileSync(join(OUTPUT_DIR, 'validation-report.json'), JSON.stringify(validations, null, 2));
  log('  SAVED validation-report.json');

  for (const v of validations) {
    const status = v.ok ? 'PASS' : 'FAIL';
    log(`  ${status} ${v.name}${v.errors ? ` — ${v.errors.length} error(s)` : ''}`);
    if (v.errors) {
      for (const e of v.errors.slice(0, 5)) {
        log(`    ${e}`);
      }
    }
  }

  // 8. Print summary
  log('');
  log('=== M0 Ground Truth Summary ===');
  log(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
  log(`Rounds: ${finalState.round}`);
  log(`Questions: ${finalState.questions.length}`);
  log(`Answers: ${finalState.humanResponses.length}`);
  log(`Critic passed: ${finalState.criticPassed}`);
  log(`PRD screens: ${finalState.prdDraft?.screens?.length ?? 0}`);
  log(`PRD entities: ${finalState.prdDraft?.dataEntities?.length ?? 0}`);
  log(`PRD features: ${finalState.prdDraft?.features?.length ?? 0}`);
  log(`Feature plan features: ${finalState.featurePlan?.features?.length ?? 0}`);
  log(`Assumption entries: ${Array.isArray(finalState.assumptions) ? finalState.assumptions.length : (finalState.assumptions as Record<string, unknown>)?.entries ? 'object' : 0}`);
  log(`Validation: ${validations.filter((v) => v.ok).length}/${validations.length} passed`);
  log(`Output: ${OUTPUT_DIR}`);

  if (validations.some((v) => !v.ok)) {
    log('\nWARNING: Some schema validations failed. Check validation-report.json.');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  log(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) {
    log(err.stack);
  }
  process.exitCode = 1;
});
