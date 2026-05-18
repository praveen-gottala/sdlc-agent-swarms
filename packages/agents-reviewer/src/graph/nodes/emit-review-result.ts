/**
 * @module emit-review-result
 *
 * Reviewer Node 4: emits the final ReviewResult.
 * Deterministic — no LLM call. Composes the result from
 * gate findings + LLM review + assumption validation results,
 * reconciling any gate or assumption failures.
 *
 * Vision Layer 9 pass 4 (triage) — merges all upstream passes.
 */

import { debugLog } from '@agentforge/core';
import type { ReviewResult, ReviewFinding } from '@agentforge/core';
import type { ReviewerDeps, ReviewerNodeFn } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';

export function createEmitReviewResult(_deps: ReviewerDeps): ReviewerNodeFn {
  return async (state: ReviewerStateType): Promise<Partial<ReviewerStateType>> => {
    debugLog('emitReviewResult: ENTER');

    const llmResult = state.reviewResult;

    if (!llmResult) {
      debugLog('emitReviewResult: no LLM review result — emitting escalation');
      return {
        reviewResult: {
          id: crypto.randomUUID(),
          diffId: state.diff?.id ?? 'unknown',
          findings: [],
          assumptionViolations: [],
          outcome: 'escalated',
          revisionCount: 0,
        },
      };
    }

    // Merge deterministic gate failures into findings if not already covered
    const gateFindings: ReviewFinding[] = [];
    for (const gate of state.gateResults) {
      if (gate.passed) continue;
      const alreadyCovered = llmResult.findings.some(
        (f) => f.evidence.includes(gate.name) || f.description.includes(gate.name),
      );
      if (!alreadyCovered) {
        gateFindings.push({
          id: `gate-${gate.name}`,
          category: 'blocking',
          description: `Deterministic gate failed: ${gate.name}`,
          file: '',
          evidence: gate.detail,
        });
      }
    }

    const allFindings = [...gateFindings, ...llmResult.findings];
    const hasBlocking = allFindings.some((f) => f.category === 'blocking');

    // Merge assumption validation results into violation IDs
    const assumptionViolations = state.assumptionValidationResults
      .filter((r) => r.violated)
      .map((r) => r.assumptionId);

    const hasBlockingAssumption = state.assumptionValidationResults.some(
      (r) => r.violated && r.severity === 'blocking',
    );

    // Reconcile outcome: gates or assumptions can override LLM-approved
    let outcome = llmResult.outcome;
    if (hasBlocking && outcome === 'approved') {
      outcome = 'rejected';
    }
    if (hasBlockingAssumption && outcome === 'approved') {
      outcome = 'rejected';
    }

    const result: ReviewResult = {
      id: llmResult.id,
      diffId: llmResult.diffId,
      findings: allFindings,
      assumptionViolations,
      outcome,
      revisionCount: llmResult.revisionCount,
    };

    debugLog(
      `emitReviewResult: EXIT — outcome=${result.outcome}, ` +
      `${result.findings.length} findings (${gateFindings.length} from gates), ` +
      `${result.assumptionViolations.length} violations`,
    );

    return { reviewResult: result };
  };
}
