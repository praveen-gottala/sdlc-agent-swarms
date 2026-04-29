/**
 * @module @agentforge/agents-clarifier/nodes/question-prioritizer
 *
 * Question Prioritizer node (Task 1.4).
 * EVPI proxy ranking: blast_radius * answerability * confidence_gap.
 * Budget: micro 0-2, standard 3-7, cross-cutting max 15/round, max 3 rounds.
 * Below-threshold gaps become AssumptionLedger entries.
 * No LLM calls — pure computation.
 */

import type { AssumptionLedger } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState, Gap, Question } from '../types.js';

// ---------------------------------------------------------------------------
// EVPI proxy scoring
// ---------------------------------------------------------------------------

const BLAST_RADIUS: Record<Gap['category'], number> = {
  missing: 0.9,
  conflicting: 0.85,
  ambiguous: 0.7,
  incomplete: 0.5,
};

function computeEVPI(gap: Gap): number {
  const blastRadius = BLAST_RADIUS[gap.category];
  const answerability = gap.deterministic ? 0.9 : 0.7;
  const confidenceGap = 1 - gap.confidence;
  return blastRadius * answerability * confidenceGap;
}

// ---------------------------------------------------------------------------
// Budget computation (vision Layer 5)
// ---------------------------------------------------------------------------

const EVPI_THRESHOLD = 0.15;

function computeBudget(prdDraft: ClarifierState['prdDraft']): number {
  if (!prdDraft) return 2;
  const featureCount = prdDraft.features.length;
  const screenCount = prdDraft.screens.length;
  const entityCount = prdDraft.dataEntities.length;
  const total = featureCount + screenCount + entityCount;

  if (total <= 5) return 2;
  if (total <= 15) return 7;
  return 15;
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

function gapToQuestion(gap: Gap, index: number, context: ClarifierState): Question {
  const hasCodeChunks = (context.context.codeChunks?.length ?? 0) > 0;
  const hasDivergent = (gap.divergentInterpretations?.length ?? 0) >= 2;
  const useMultipleChoice = context.mode === 'evolution' && hasCodeChunks && hasDivergent;

  return {
    id: `q-${context.round}-${index}`,
    gapId: gap.id,
    text: buildQuestionText(gap),
    type: useMultipleChoice ? 'multiple-choice' : 'open',
    ...(useMultipleChoice && gap.divergentInterpretations
      ? { options: [...gap.divergentInterpretations] }
      : {}),
    priority: index + 1,
    evpiScore: computeEVPI(gap),
  };
}

function buildQuestionText(gap: Gap): string {
  switch (gap.category) {
    case 'missing':
      return `The specification does not address: ${gap.description} — what is the expected behavior?`;
    case 'ambiguous':
      return `This requirement is ambiguous: ${gap.description} — which interpretation is correct?`;
    case 'conflicting':
      return `There is a conflict: ${gap.description} — which requirement takes priority?`;
    case 'incomplete':
      return `This requirement is incomplete: ${gap.description} — what additional detail is needed?`;
  }
}

// ---------------------------------------------------------------------------
// Assumption generation for below-threshold gaps
// ---------------------------------------------------------------------------

function gapsToAssumptions(
  gaps: readonly Gap[],
  existing: AssumptionLedger | null,
): AssumptionLedger {
  const now = new Date().toISOString();
  const existingEntries = existing?.entries ?? [];
  const existingIds = new Set(existingEntries.map((e) => e.id));

  const newEntries = gaps
    .filter((g) => !existingIds.has(`assumption-${g.id}`))
    .map((g) => ({
      id: `assumption-${g.id}`,
      statement: `Assumed reasonable default for: ${g.description}`,
      evidence: g.deterministic
        ? 'Deterministic checklist gap — common industry default assumed.'
        : `LLM divergence analysis (${g.divergentInterpretations?.length ?? 0} interpretations).`,
      confidence: Math.max(g.confidence, 0.3),
      blastRadius: BLAST_RADIUS[g.category] >= 0.85 ? ('high' as const) : ('low' as const),
      requiresConfirmation: g.confidence < 0.5,
    }));

  return {
    id: existing?.id ?? `ledger-${Date.now()}`,
    entries: [...existingEntries, ...newEntries],
    createdAt: existing?.createdAt ?? now,
    lastUpdatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a Question Prioritizer node function for the Clarifier StateGraph.
 * Ranks gaps by EVPI and converts below-threshold gaps to assumptions.
 */
export function createQuestionPrioritizer(_deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    if (!state.gaps.length) {
      return { questions: [], assumptions: state.assumptions };
    }

    const scored = state.gaps
      .map((gap) => ({ gap, evpi: computeEVPI(gap) }))
      .sort((a, b) => b.evpi - a.evpi);

    const budget = computeBudget(state.prdDraft);

    const aboveThreshold = scored.filter((s) => s.evpi >= EVPI_THRESHOLD);
    const belowThreshold = scored.filter((s) => s.evpi < EVPI_THRESHOLD);

    const topGaps = aboveThreshold.slice(0, budget);
    const budgetOverflow = aboveThreshold.slice(budget);

    const questions: Question[] = topGaps.map((s, i) =>
      gapToQuestion(s.gap, i, state),
    );

    const assumptionGaps = [...belowThreshold.map((s) => s.gap), ...budgetOverflow.map((s) => s.gap)];
    const assumptions = assumptionGaps.length > 0
      ? gapsToAssumptions(assumptionGaps, state.assumptions)
      : state.assumptions;

    return { questions, assumptions };
  };
}

export { computeEVPI, computeBudget, gapsToAssumptions, EVPI_THRESHOLD, buildQuestionText };
