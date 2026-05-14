/**
 * @module @agentforge/eval/runner
 *
 * Orchestrates scenario execution: compiles the clarifier graph once,
 * streams per-node events for progress visibility, handles the
 * interrupt/resume loop with the simulator, and computes metrics.
 *
 * Resume uses updateState + stream(null) — passing input to stream()
 * restarts the graph from scratch instead of resuming from checkpoint.
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MemorySaver, Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { compileClarifierGraph } from '@agentforge/agents-clarifier';
import type { ClarifierDeps, ClarifierState } from '@agentforge/agents-clarifier';
import type { LLMProvider } from '@agentforge/providers';
import { simulateCooperativeAnswers } from './simulator.js';
import { computeMetrics } from './metrics/clarifier-metrics.js';
import type { ClarifierEvalScenario, ClarifierMetrics, EvalError } from './types.js';
import { createRecordingProvider } from './recording-provider.js';

const RUN_TIMEOUT_MS = 600_000;
const MAX_RESUME_ROUNDS = 10;

/** Progress callback for real-time visibility during eval runs. */
export type ProgressCallback = (message: string) => void;

type CompiledGraph = ReturnType<typeof compileClarifierGraph>;

/**
 * Run a single eval scenario end-to-end.
 * Compiles the graph once and reuses it for interrupt/resume cycles.
 */
export async function runScenario(
  scenario: ClarifierEvalScenario,
  provider: LLMProvider,
  timeoutMs: number = RUN_TIMEOUT_MS,
  onProgress?: ProgressCallback,
): Promise<Result<ClarifierMetrics, EvalError>> {
  const startTime = Date.now();
  const checkpointer = new MemorySaver();
  const threadId = `eval-${scenario.id}-${Date.now()}`;
  const projectId = `eval-${scenario.id}-${Date.now()}`;
  const projectRoot = mkdtempSync(join(tmpdir(), `eval-${scenario.id}-`));

  const baseCatalog = loadBaseCatalogYaml();

  const trackedProvider = createRecordingProvider({
    mode: 'record',
    cassettePath: join(projectRoot, 'cassette.jsonl'),
    innerProvider: provider,
  });

  const deps: ClarifierDeps = {
    provider: trackedProvider,
    projectRoot,
    projectId,
    baseCatalog,
  };

  const compiled = compileClarifierGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  const runPipeline = async (): Promise<Result<ClarifierMetrics, EvalError>> => {
    onProgress?.(`  Starting pipeline (threadId: ${threadId})`);

    // First invocation — start the graph
    await streamAndLog(compiled, { rawInput: scenario.rawInput, mode: scenario.mode, maxRounds: scenario.maxRounds, threadId }, config, onProgress);

    let graphState = await compiled.getState(config);
    let interrupted = (graphState.next?.length ?? 0) > 0;
    let safetyCounter = 0;

    // Capture first PRD snapshot for prdHashEqualAcrossRounds metric
    const firstPrdDraft = (graphState.values as ClarifierState).prdDraft;

    while (interrupted && safetyCounter < MAX_RESUME_ROUNDS) {
      const state = graphState.values as ClarifierState;
      const questions = state.questions;
      const humanResponses = simulateCooperativeAnswers(questions, scenario.maxAnswersPerRound);

      onProgress?.(`  Resuming with ${humanResponses.length} answers (round ${state.round})`);

      const escalationDecision = state.round >= state.maxRounds ? 'accept' as const : undefined;
      if (escalationDecision) {
        onProgress?.(`  Escalation: round ${state.round} >= maxRounds ${state.maxRounds}, accepting`);
      }

      // Update checkpoint state, then resume with stream(null)
      const stateUpdate: Record<string, unknown> = { humanResponses };
      if (escalationDecision) {
        stateUpdate.escalationDecision = escalationDecision;
      }
      await compiled.updateState(config, stateUpdate);
      await streamAndLog(compiled, null, config, onProgress);

      graphState = await compiled.getState(config);
      interrupted = (graphState.next?.length ?? 0) > 0;
      safetyCounter++;
    }

    const durationMs = Date.now() - startTime;
    const costSummary = trackedProvider.getCostSummary();

    const finalState = graphState.values as ClarifierState;
    const metrics = computeMetrics(scenario.id, threadId, finalState, costSummary, durationMs, firstPrdDraft);
    return Ok(metrics);
  };

  const timeoutPromise = new Promise<Result<ClarifierMetrics, EvalError>>((resolve) => {
    setTimeout(() => {
      resolve(Err({ code: 'TIMEOUT', message: `Scenario ${scenario.id} exceeded ${timeoutMs}ms timeout` }));
    }, timeoutMs);
  });

  return Promise.race([runPipeline(), timeoutPromise]);
}

/** Stream graph execution and log per-node progress. */
async function streamAndLog(
  compiled: CompiledGraph,
  input: Record<string, unknown> | null,
  config: { configurable: { thread_id: string } },
  onProgress?: ProgressCallback,
): Promise<void> {
  const stream = await compiled.stream(input, { ...config, streamMode: 'updates' as const });

  for await (const update of stream) {
    const nodeNames = Object.keys(update as Record<string, unknown>);
    for (const node of nodeNames) {
      if (node === '__interrupt__') continue;
      onProgress?.(`  [node] ${node} complete`);
    }
  }
}

function loadBaseCatalogYaml(): string | undefined {
  try {
    const thisFile = typeof __filename !== 'undefined'
      ? __filename
      : fileURLToPath(import.meta.url);
    const monorepoRoot = join(dirname(thisFile), '..', '..', '..');
    const catalogPath = join(monorepoRoot, 'packages', 'core', 'src', 'catalogs', 'base-component-catalog.yaml');
    return readFileSync(catalogPath, 'utf-8');
  } catch {
    return undefined;
  }
}
