/**
 * @module deterministic-gates
 *
 * Reviewer Node 1: deterministic quality gates run before LLM review.
 * Composes modular gate runners from gates/ directory.
 * M4 gates (5) + drift-check gates (8) + rubric gates (3) = 16 total.
 *
 * Vision Layer 9 pass 1 — deterministic gates.
 */

import { debugLog } from '@agentforge/core';
import type { ReviewerDeps, ReviewerNodeFn } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import { runM4Gates } from './gates/m4-gates.js';
import { runDriftCheckGates } from './gates/drift-check-gates.js';
import { runRubricGates } from './gates/rubric-gates.js';

export function createDeterministicGates(deps: ReviewerDeps): ReviewerNodeFn {
  return async (state: ReviewerStateType): Promise<Partial<ReviewerStateType>> => {
    debugLog('deterministicGates: ENTER');

    const m4Results = runM4Gates(state.diff, state.taskCompletionReport);
    const driftResults = runDriftCheckGates(state.diff, state.contractBundle);
    const rubricResults = runRubricGates(state.diff, deps.planFilePaths ?? null);

    const results = [...m4Results, ...driftResults, ...rubricResults];
    const allPassed = results.every((r) => r.passed);

    debugLog(
      `deterministicGates: EXIT — ${results.length} gates, ` +
      `${results.filter((r) => r.passed).length} passed, ` +
      `${results.filter((r) => !r.passed).length} failed`,
    );

    return { gateResults: results, gatesPassed: allPassed };
  };
}
