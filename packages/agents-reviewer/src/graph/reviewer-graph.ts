/**
 * @module @agentforge/agents-reviewer/graph/reviewer-graph
 *
 * LangGraph StateGraph assembly for the Reviewer pipeline.
 * Sequential: deterministicGates → llmReview → emitReviewResult → END
 *
 * No HITL interrupts in v1 — the Reviewer produces a ReviewResult
 * that the caller uses to drive bounded retry. The merge gate (HITL)
 * lives in the orchestrator/CLI, not inside this graph.
 *
 * Mirrors implementer-graph.ts in @agentforge/agents-implementer.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { debugLog } from '@agentforge/core';
import type { BaseCheckpointSaver } from '@agentforge/core';
import { ReviewerStateAnnotation } from './state.js';
import type { ReviewerDeps } from '../deps.js';
import { createDeterministicGates } from './nodes/deterministic-gates.js';
import { createLlmReview } from './nodes/llm-review.js';
import { createEmitReviewResult } from './nodes/emit-review-result.js';

/**
 * Build the Reviewer StateGraph with typed channels.
 * 3-node v1: deterministicGates → llmReview → emitReviewResult → END
 */
export function buildReviewerGraph(deps: ReviewerDeps) {
  debugLog('buildReviewerGraph: assembling 3-node v1');
  return new StateGraph(ReviewerStateAnnotation)
    .addNode('deterministicGates', createDeterministicGates(deps))
    .addNode('llmReview', createLlmReview(deps))
    .addNode('emitReviewResult', createEmitReviewResult(deps))
    .addEdge('__start__', 'deterministicGates')
    .addEdge('deterministicGates', 'llmReview')
    .addEdge('llmReview', 'emitReviewResult')
    .addEdge('emitReviewResult', END);
}

/**
 * Compile the Reviewer graph with optional checkpointer.
 * No interruptBefore — HITL merge gate is caller responsibility.
 */
export function compileReviewerGraph(
  deps: ReviewerDeps,
  checkpointer?: BaseCheckpointSaver,
): ReturnType<ReturnType<typeof buildReviewerGraph>['compile']> {
  const graph = buildReviewerGraph(deps);
  return graph.compile({ checkpointer });
}
