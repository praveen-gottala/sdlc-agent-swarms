/**
 * @module @agentforge/eval/metrics/clarifier-metrics
 *
 * Six metrics with direction for regression detection.
 * Computes metrics from the final graph state and cost summary.
 */

import { createHash } from 'node:crypto';
import type { ClarifierState, Question } from '@agentforge/agents-clarifier';
import type { PRD } from '@agentforge/core';
import type { ClarifierMetrics, MetricDefinition, RunCostSummary } from '../types.js';

/**
 * Compute all clarifier metrics from the final graph state and cost data.
 *
 * @param firstPrdDraft - PRD snapshot captured after the first invocation,
 *   before any HITL resume. Used to compute prdHashEqualAcrossRounds.
 */
export function computeMetrics(
  scenarioId: string,
  threadId: string,
  state: ClarifierState,
  costSummary: RunCostSummary,
  durationMs: number,
  firstPrdDraft?: PRD | null,
): ClarifierMetrics {
  const questions = state.questions;

  const totalQuestions = questions.length;
  const roundCount = state.round;
  const gapOverlapRatio = computeGapOverlapRatio(questions);
  const prdDiffBytes = computePrdDiffBytes(firstPrdDraft, state.prdDraft);
  const prdHashEqualAcrossRounds = computePrdHashEqual(firstPrdDraft, state.prdDraft);

  return {
    scenarioId,
    threadId,
    totalQuestions,
    roundCount,
    gapOverlapRatio,
    prdDiffBytes,
    prdHashEqualAcrossRounds,
    totalCostUsd: costSummary.totalCostUsd,
    durationMs,
  };
}

function computeGapOverlapRatio(questions: readonly Question[]): number {
  if (questions.length === 0) return 0;
  const uniqueGapIds = new Set(questions.map((q) => q.gapId));
  return 1 - uniqueGapIds.size / questions.length;
}

function computePrdDiffBytes(
  firstPrd: PRD | null | undefined,
  finalPrd: PRD | null | undefined,
): number | null {
  if (!firstPrd || !finalPrd) return null;
  const firstStr = JSON.stringify(firstPrd);
  const finalStr = JSON.stringify(finalPrd);
  return Math.abs(Buffer.byteLength(finalStr) - Buffer.byteLength(firstStr));
}

function computePrdHashEqual(
  firstPrd: PRD | null | undefined,
  finalPrd: PRD | null | undefined,
): boolean | null {
  if (!firstPrd || !finalPrd) return null;
  const firstHash = createHash('sha256').update(JSON.stringify(firstPrd)).digest('hex');
  const finalHash = createHash('sha256').update(JSON.stringify(finalPrd)).digest('hex');
  return firstHash === finalHash;
}

/** Metric definitions with direction for regression detection. */
export const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    name: 'total-questions',
    direction: 'lower-is-better',
    compute: (m) => m.totalQuestions,
  },
  {
    name: 'round-count',
    direction: 'lower-is-better',
    compute: (m) => m.roundCount,
  },
  {
    name: 'gap-overlap-ratio',
    direction: 'lower-is-better',
    compute: (m) => m.gapOverlapRatio,
  },
  {
    name: 'prd-diff-bytes',
    direction: 'higher-is-better',
    compute: (m) => m.prdDiffBytes,
  },
  {
    name: 'total-cost-usd',
    direction: 'lower-is-better',
    compute: (m) => m.totalCostUsd,
  },
];
