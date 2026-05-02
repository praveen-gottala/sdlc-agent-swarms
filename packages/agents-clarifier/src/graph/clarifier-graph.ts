/**
 * @module @agentforge/agents-clarifier/graph/clarifier-graph
 *
 * LangGraph StateGraph assembly for the Clarifier pipeline (Task 1.7).
 * Sequential: contextRetriever → prdAnalyzer → gapDetector →
 *   questionPrioritizer → [HITL interrupt] → storyWriter → critic
 *
 * Conditional routing after critic:
 *   - critic fails + retries < 2 → storyWriter (retry)
 *   - round < maxRounds + unresolved gaps → gapDetector (new round)
 *   - round >= maxRounds → escalationGate [HITL interrupt]
 *   - criticPassed → emitComplete → END
 *
 * HITL via interrupt_before on storyWriter and escalationGate nodes.
 * Postgres checkpointer via createCheckpointer() from @agentforge/core.
 */

import { StateGraph, END } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@agentforge/core';
import { ClarifierStateAnnotation } from './state.js';
import type { ClarifierDeps } from '../deps.js';
import type { ClarifierState } from '../types.js';
import { createContextRetriever } from '../nodes/context-retriever.js';
import { createPrdAnalyzer } from '../nodes/prd-analyzer.js';
import { createGapDetector } from '../nodes/gap-detector.js';
import { createQuestionPrioritizer } from '../nodes/question-prioritizer.js';
import { createStoryWriter } from '../nodes/story-writer.js';
import { createCritic } from '../nodes/critic.js';
import { createPrdUpdater } from '../nodes/prd-updater.js';

function hasUnresolvedGaps(state: ClarifierState): boolean {
  const answeredGapIds = new Set(
    state.humanResponses
      .map((r) => state.questions.find((q) => q.id === r.questionId)?.gapId)
      .filter(Boolean),
  );
  return state.gaps.some((g) => !answeredGapIds.has(g.id) && g.confidence < 0.8);
}

function routeAfterCritic(state: ClarifierState): string {
  if (!state.criticPassed && state.criticRetries < 2) {
    return 'storyWriter';
  }
  if (state.round < state.maxRounds && hasUnresolvedGaps(state)) {
    return 'prdUpdater';
  }
  if (state.round >= state.maxRounds) {
    return 'escalationGate';
  }
  return 'emitComplete';
}

function routeAfterEscalation(state: ClarifierState): string {
  if (state.escalationDecision === 'accept') return 'emitComplete';
  if (state.escalationDecision === 'restart') return 'prdUpdater';
  return END;
}

async function escalationGate(state: ClarifierState): Promise<Partial<ClarifierState>> {
  if (state.escalationDecision === 'restart') {
    return { round: 0, criticRetries: 0, criticPassed: false };
  }
  return {};
}

async function emitComplete(_state: ClarifierState): Promise<Partial<ClarifierState>> {
  return {};
}

/**
 * Build the Clarifier StateGraph with typed channels and HITL interrupt.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildClarifierGraph(deps: ClarifierDeps) {
  return new StateGraph(ClarifierStateAnnotation)
    .addNode('contextRetriever', createContextRetriever(deps))
    .addNode('prdAnalyzer', createPrdAnalyzer(deps))
    .addNode('gapDetector', createGapDetector(deps))
    .addNode('questionPrioritizer', createQuestionPrioritizer(deps))
    .addNode('storyWriter', createStoryWriter(deps))
    .addNode('critic', createCritic(deps))
    .addNode('prdUpdater', createPrdUpdater(deps))
    .addNode('escalationGate', escalationGate)
    .addNode('emitComplete', emitComplete)
    .addEdge('__start__', 'contextRetriever')
    .addEdge('contextRetriever', 'prdAnalyzer')
    .addEdge('prdAnalyzer', 'gapDetector')
    .addEdge('prdUpdater', 'gapDetector')
    .addEdge('gapDetector', 'questionPrioritizer')
    .addEdge('questionPrioritizer', 'storyWriter')
    .addEdge('storyWriter', 'critic')
    .addConditionalEdges('critic', routeAfterCritic)
    .addConditionalEdges('escalationGate', routeAfterEscalation)
    .addEdge('emitComplete', END);
}

/**
 * Compile the Clarifier graph with HITL interrupt and checkpointer.
 */
export function compileClarifierGraph(
  deps: ClarifierDeps,
  checkpointer?: BaseCheckpointSaver,
): ReturnType<ReturnType<typeof buildClarifierGraph>['compile']> {
  const graph = buildClarifierGraph(deps);
  return graph.compile({
    interruptBefore: ['storyWriter', 'escalationGate'],
    checkpointer,
  });
}

export { routeAfterCritic, routeAfterEscalation, hasUnresolvedGaps };
