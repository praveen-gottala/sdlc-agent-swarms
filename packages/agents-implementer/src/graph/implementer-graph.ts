/**
 * @module @agentforge/agents-implementer/graph/implementer-graph
 *
 * LangGraph StateGraph assembly for the Implementer pipeline.
 * Sequential: loadTaskContext → [frontend? runDesignSpecialist →]
 *   generateCode → reportCompletion → END
 *
 * No HITL interrupts in v1 — the Implementer executes straight through.
 * HITL gates are at Clarifier (questions), Architect (Gate 2), and
 * Reviewer (code merge) per vision Layer 10.
 *
 * Mirrors architect-graph.ts in @agentforge/agents-architect.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { debugLog } from '@agentforge/core';
import type { BaseCheckpointSaver } from '@agentforge/core';
import { ImplementerStateAnnotation } from './state.js';
import type { ImplementerStateType } from './state.js';
import type { ImplementerDeps } from '../deps.js';
import { createLoadTaskContext } from './nodes/load-task-context.js';
import { createRunDesignSpecialist } from './nodes/run-design-specialist.js';
import { createGenerateCode } from './nodes/generate-code.js';
import { createReportCompletion } from './nodes/report-completion.js';

function routeAfterLoadContext(state: ImplementerStateType): string {
  if (state.task?.type === 'frontend') {
    debugLog('route: loadTaskContext→runDesignSpecialist (frontend task)');
    return 'runDesignSpecialist';
  }
  debugLog(`route: loadTaskContext→generateCode (${state.task?.type ?? 'unknown'} task)`);
  return 'generateCode';
}

/**
 * Build the Implementer StateGraph with typed channels.
 * No HITL interrupts — v1 runs straight through.
 */
export function buildImplementerGraph(deps: ImplementerDeps) {
  return new StateGraph(ImplementerStateAnnotation)
    .addNode('loadTaskContext', createLoadTaskContext(deps))
    .addNode('runDesignSpecialist', createRunDesignSpecialist(deps))
    .addNode('generateCode', createGenerateCode(deps))
    .addNode('reportCompletion', createReportCompletion(deps))
    .addEdge('__start__', 'loadTaskContext')
    .addConditionalEdges('loadTaskContext', routeAfterLoadContext)
    .addEdge('runDesignSpecialist', 'generateCode')
    .addEdge('generateCode', 'reportCompletion')
    .addEdge('reportCompletion', END);
}

/**
 * Compile the Implementer graph with optional checkpointer.
 * No interruptBefore — the Implementer has no HITL gates in v1.
 */
export function compileImplementerGraph(
  deps: ImplementerDeps,
  checkpointer?: BaseCheckpointSaver,
): ReturnType<ReturnType<typeof buildImplementerGraph>['compile']> {
  const graph = buildImplementerGraph(deps);
  return graph.compile({ checkpointer });
}

export { routeAfterLoadContext };
