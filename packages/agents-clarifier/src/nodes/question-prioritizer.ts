/**
 * @module @agentforge/agents-clarifier/nodes/question-prioritizer
 *
 * Question Prioritizer node (Task 1.4).
 * EVPI proxy ranking: blast_radius * answerability * confidence_gap.
 * Budget: micro 0-2, standard 3-7, cross-cutting max 15/round, max 3 rounds.
 * Below-threshold gaps become AssumptionLedger entries.
 * Divergence-based over-asking gate prevents unnecessary questions.
 * No LLM calls — pure computation.
 */

import { debugLog } from '@agentforge/core';
import type { AssumptionLedger } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState, Gap, Question, StructuredOption } from '../types.js';

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
const DIVERGENCE_THRESHOLD = 0.3;

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
// Over-asking prevention (divergence-based gate)
// ---------------------------------------------------------------------------

function shouldAskQuestion(gap: Gap, evpi: number): boolean {
  if (evpi < EVPI_THRESHOLD) return false;
  if (gap.divergenceScore !== undefined && gap.divergenceScore < DIVERGENCE_THRESHOLD) {
    debugLog(`question-prioritizer: auto-resolving gap ${gap.id} — divergenceScore ${gap.divergenceScore} below ${DIVERGENCE_THRESHOLD}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Recommendation validation
// ---------------------------------------------------------------------------

function validateRecommendations(options: readonly StructuredOption[]): StructuredOption[] {
  const recommendedCount = options.filter((o) => o.recommended).length;

  if (recommendedCount === 0) {
    debugLog('question-prioritizer: LLM set zero recommendations — rendering without badge');
    return options.map((o) => ({ ...o }));
  }

  if (recommendedCount === 1) {
    return options.map((o) => ({ ...o }));
  }

  debugLog(`question-prioritizer: LLM set ${recommendedCount} recommendations — keeping first only`);
  let firstFound = false;
  return options.map((o) => {
    if (o.recommended && !firstFound) {
      firstFound = true;
      return { ...o };
    }
    return { ...o, recommended: false };
  });
}

// ---------------------------------------------------------------------------
// Question generation
// ---------------------------------------------------------------------------

function gapToQuestion(gap: Gap, index: number, context: ClarifierState): Question {
  const hasDivergent = (gap.divergentInterpretations?.length ?? 0) >= 2;

  if (!hasDivergent) {
    debugLog(`question-prioritizer: gap ${gap.id} has no options — falling back to open type (gap-detector should provide options for all gaps)`);
  }

  const validatedOptions = hasDivergent && gap.divergentInterpretations
    ? validateRecommendations(gap.divergentInterpretations)
    : undefined;

  return {
    id: `q-${context.round}-${index}`,
    gapId: gap.id,
    topic: gap.topic,
    text: buildQuestionText(gap),
    type: hasDivergent ? 'multiple-choice' : 'open',
    ...(validatedOptions ? { options: validatedOptions } : {}),
    priority: index + 1,
    evpiScore: computeEVPI(gap),
  };
}

function buildQuestionText(gap: Gap): string {
  if (gap.description.endsWith('?')) return gap.description;

  const desc = gap.description.replace(/^PRD /i, '').replace(/\.+$/, '');
  return `${desc}?`;
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
    .map((g) => {
      const isDivergenceGated = g.divergenceScore !== undefined && g.divergenceScore < DIVERGENCE_THRESHOLD;
      return {
        id: `assumption-${g.id}`,
        statement: `Assumed reasonable default for: ${g.description}`,
        evidence: isDivergenceGated
          ? `Low divergence (score: ${g.divergenceScore}) — implementations converged.`
          : g.deterministic
            ? 'Deterministic checklist gap — common industry default assumed.'
            : `LLM divergence analysis (${g.divergentInterpretations?.length ?? 0} options).`,
        confidence: isDivergenceGated
          ? Math.max(g.confidence, 1 - (g.divergenceScore ?? 0))
          : Math.max(g.confidence, 0.3),
        blastRadius: BLAST_RADIUS[g.category] >= 0.85 ? ('high' as const) : ('low' as const),
        requiresConfirmation: isDivergenceGated ? false : g.confidence < 0.5,
      };
    });

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
 * Ranks gaps by EVPI, applies divergence-based over-asking gate,
 * and converts below-threshold gaps to assumptions.
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

    const askable = scored.filter((s) => shouldAskQuestion(s.gap, s.evpi));
    const notAskable = scored.filter((s) => !shouldAskQuestion(s.gap, s.evpi));

    const topGaps = askable.slice(0, budget);
    const budgetOverflow = askable.slice(budget);

    const questions: Question[] = topGaps.map((s, i) =>
      gapToQuestion(s.gap, i, state),
    );

    const assumptionGaps = [...notAskable.map((s) => s.gap), ...budgetOverflow.map((s) => s.gap)];
    const assumptions = assumptionGaps.length > 0
      ? gapsToAssumptions(assumptionGaps, state.assumptions)
      : state.assumptions;

    return { questions, assumptions };
  };
}

export {
  computeEVPI,
  computeBudget,
  gapsToAssumptions,
  shouldAskQuestion,
  validateRecommendations,
  EVPI_THRESHOLD,
  DIVERGENCE_THRESHOLD,
  buildQuestionText,
};
