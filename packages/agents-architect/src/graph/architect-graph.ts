/**
 * @module @agentforge/agents-architect/graph/architect-graph
 *
 * LangGraph StateGraph assembly for the Architect pipeline (M3 Phase 3).
 * Sequential: [brownfield? changeClassifier →] contextAssembler →
 *   optionsExplorer → architectureWriter → contractDesigner →
 *   taskPlanner → critic → [passed?] gate2Approval → END
 *
 * Conditional routing after critic:
 *   - passed → gate2Approval (HITL interrupt — vision Layer 10)
 *   - retryable → routeAfterCritic() per-gate target (Phase 7)
 *   - max retries → escalationGate (HITL interrupt)
 *
 * After gate2Approval:
 *   - approved → END
 *   - rejected with edits → architectureWriter (re-run from Node 3)
 *
 * HITL via interruptBefore on gate2Approval and escalationGate.
 * Postgres checkpointer via createCheckpointer() from @agentforge/core.
 */

import { StateGraph, END } from '@langchain/langgraph';
import { debugLog } from '@agentforge/core';
import type { BaseCheckpointSaver } from '@agentforge/core';
import { ArchitectStateAnnotation } from './state.js';
import type { ArchitectStateType } from './state.js';
import type { ArchitectDeps } from '../deps.js';
import { createChangeClassifier } from './nodes/change-classifier.js';
import { createContextAssembler } from './nodes/context-assembler.js';
import { createOptionsExplorer } from './nodes/options-explorer.js';
import { createArchitectureWriter } from './nodes/architecture-writer.js';
import { createCritic } from './nodes/critic.js';
import { gate2Approval } from './nodes/gate2-approval.js';
import { escalationGate } from './nodes/escalation-gate.js';

const MAX_CRITIC_RETRIES = 1;

function routeFromStart(state: ArchitectStateType): string {
  if (state.mode === 'brownfield') {
    debugLog('route: __start__→changeClassifier (brownfield)');
    return 'changeClassifier';
  }
  debugLog('route: __start__→contextAssembler (greenfield)');
  return 'contextAssembler';
}

function routeAfterCritic(state: ArchitectStateType): string {
  if (state.criticPassed) {
    debugLog('route: critic→gate2Approval (passed)');
    return 'gate2Approval';
  }
  if (state.criticRetries > MAX_CRITIC_RETRIES) {
    debugLog(`route: critic→escalationGate (retries=${state.criticRetries} > max=${MAX_CRITIC_RETRIES})`);
    return 'escalationGate';
  }
  // Phase 7 will implement per-gate retry routing matrix
  debugLog(`route: critic→taskPlanner (retry ${state.criticRetries})`);
  return 'taskPlanner';
}

function routeAfterGate2(state: ArchitectStateType): string {
  if (state.gate2Decision === 'rejected') {
    debugLog('route: gate2→architectureWriter (rejected with edits)');
    return 'architectureWriter';
  }
  debugLog('route: gate2→END (approved)');
  return END;
}

/**
 * Build the Architect StateGraph with typed channels and HITL interrupts.
 * Node 3 (architectureWriter) is implemented (Phase 4). Nodes 4–5 remain placeholders.
 */
export function buildArchitectGraph(deps: ArchitectDeps) {
  const architectureWriter = createArchitectureWriter(deps);
  const contractDesigner = async (_state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner: ENTER (placeholder)');
    return {};
  };
  const taskPlanner = async (_state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('taskPlanner: ENTER (placeholder)');
    return {};
  };

  return new StateGraph(ArchitectStateAnnotation)
    .addNode('changeClassifier', createChangeClassifier(deps))
    .addNode('contextAssembler', createContextAssembler(deps))
    .addNode('optionsExplorer', createOptionsExplorer(deps))
    .addNode('architectureWriter', architectureWriter)
    .addNode('contractDesigner', contractDesigner)
    .addNode('taskPlanner', taskPlanner)
    .addNode('critic', createCritic())
    .addNode('gate2Approval', gate2Approval)
    .addNode('escalationGate', escalationGate)
    .addConditionalEdges('__start__', routeFromStart)
    .addEdge('changeClassifier', 'contextAssembler')
    .addEdge('contextAssembler', 'optionsExplorer')
    .addEdge('optionsExplorer', 'architectureWriter')
    .addEdge('architectureWriter', 'contractDesigner')
    .addEdge('contractDesigner', 'taskPlanner')
    .addEdge('taskPlanner', 'critic')
    .addConditionalEdges('critic', routeAfterCritic)
    .addConditionalEdges('gate2Approval', routeAfterGate2)
    .addEdge('escalationGate', END);
}

/**
 * Compile the Architect graph with HITL interrupts and checkpointer.
 */
export function compileArchitectGraph(
  deps: ArchitectDeps,
  checkpointer?: BaseCheckpointSaver,
): ReturnType<ReturnType<typeof buildArchitectGraph>['compile']> {
  const graph = buildArchitectGraph(deps);
  return graph.compile({
    interruptBefore: ['gate2Approval', 'escalationGate'],
    checkpointer,
  });
}

export { routeFromStart, routeAfterCritic, routeAfterGate2 };
