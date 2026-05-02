/**
 * @module @agentforge/agents-clarifier/graph/state
 *
 * Typed LangGraph state definition for the Clarifier pipeline.
 * Uses Annotation from @langchain/langgraph for typed channels (vision Layer 2).
 */

import { Annotation } from '@langchain/langgraph';
import type { EnrichedRequirement, AssumptionLedger, PRD, FeaturePlan } from '@agentforge/core';
import type {
  ClarifierMode,
  ClarifierContext,
  EscalationDecision,
  Gap,
  Question,
  HumanResponse,
} from '../types.js';

/**
 * LangGraph state annotation for the Clarifier graph.
 * Each field is a typed channel with a default value.
 */
export const ClarifierStateAnnotation = Annotation.Root({
  rawInput: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  mode: Annotation<ClarifierMode>({ reducer: (_, b) => b, default: () => 'bootstrap' }),
  context: Annotation<ClarifierContext>({ reducer: (_, b) => b, default: () => ({}) }),
  gaps: Annotation<readonly Gap[]>({ reducer: (_, b) => b, default: () => [] }),
  questions: Annotation<readonly Question[]>({ reducer: (_, b) => b, default: () => [] }),
  humanResponses: Annotation<readonly HumanResponse[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  requirement: Annotation<EnrichedRequirement | null>({ reducer: (_, b) => b, default: () => null }),
  assumptions: Annotation<AssumptionLedger | null>({ reducer: (_, b) => b, default: () => null }),
  round: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  maxRounds: Annotation<number>({ reducer: (_, b) => b, default: () => 3 }),
  error: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  prdDraft: Annotation<PRD | null>({ reducer: (_, b) => b, default: () => null }),
  featurePlan: Annotation<FeaturePlan | null>({ reducer: (_, b) => b, default: () => null }),
  criticRetries: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  criticPassed: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  escalationDecision: Annotation<EscalationDecision>({ reducer: (_, b) => b, default: () => null }),
  threadId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type ClarifierStateType = typeof ClarifierStateAnnotation.State;
