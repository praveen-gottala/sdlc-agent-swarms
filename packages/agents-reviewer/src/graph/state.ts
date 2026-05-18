/**
 * @module @agentforge/agents-reviewer/graph/state
 *
 * Typed LangGraph state definition for the Reviewer pipeline.
 * Uses Annotation from @langchain/langgraph for typed channels (vision Layer 2).
 * 9 channels — mirrors the ImplementerStateAnnotation pattern.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  Diff,
  AssumptionLedger,
  ContractBundle,
  TaskCompletionReport,
  ReviewResult,
} from '@agentforge/core';
import type { GateResult, AssumptionValidationResult } from '../types.js';

/**
 * LangGraph state annotation for the Reviewer graph.
 * Each field is a typed channel with an explicit reducer and default.
 */
export const ReviewerStateAnnotation = Annotation.Root({
  // --- Input channels (1-4) ---
  diff: Annotation<Diff | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  assumptionLedger: Annotation<AssumptionLedger | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  contractBundle: Annotation<Partial<ContractBundle> | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  taskCompletionReport: Annotation<TaskCompletionReport | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),

  // --- Intermediate channels (5-7) ---
  gateResults: Annotation<readonly GateResult[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),
  gatesPassed: Annotation<boolean>({
    reducer: (_, b) => b,
    default: () => true,
  }),
  assumptionValidationResults: Annotation<readonly AssumptionValidationResult[]>({
    reducer: (_, b) => b,
    default: () => [],
  }),

  // --- Output channels (8-9) ---
  reviewResult: Annotation<ReviewResult | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  errors: Annotation<readonly string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});

export type ReviewerStateType = typeof ReviewerStateAnnotation.State;
