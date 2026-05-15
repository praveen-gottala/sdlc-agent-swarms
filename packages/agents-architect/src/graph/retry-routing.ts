/**
 * @module @agentforge/agents-architect/graph/retry-routing
 *
 * Per-gate retry routing matrix for Critic failures (M3 Phase 7).
 * Maps each of the 14 Critic gates to the appropriate re-entry node
 * in the Architect pipeline. Max 1 retry per gate → escalation.
 */

import { debugLog } from '@agentforge/core';
import type { RetryTarget } from '../types.js';
import type { ArchitectStateType } from './state.js';

const MAX_CRITIC_RETRIES = 1;

/**
 * Gate name → retry target mapping.
 *
 * - Gates 1-4 (schema, DAG, single-writer, PRD coverage) → re-run Node 5 (Task Planner)
 * - Gate 5 (entity-reference-integrity) → re-run Node 4 (Contract Designer, data-model specialist + downstream)
 * - Gate 6 (gap-resolution) → re-run Node 3 (Architecture Writer)
 * - Gate 7 (openapi-lint) → re-run Node 4 (Contract Designer, api specialist + downstream)
 * - Gate 8 (migration-sql-parses) → re-run Node 4 (Contract Designer, data-model specialist + downstream)
 * - Gate 9 (adr-completeness) → re-run Node 3 (Architecture Writer)
 * - Gates 10-13 (patternRef, contextRef, acceptanceCriteria, tokenBudget) → re-run Node 5 (Task Planner)
 * - Gate 14 (mode-consistency) → escalation (humans must resolve invented file paths)
 */
const GATE_RETRY_TARGETS: ReadonlyMap<string, RetryTarget> = new Map([
  ['schema-validation', 'taskPlanner'],
  ['dag-acyclic', 'taskPlanner'],
  ['single-writer', 'taskPlanner'],
  ['prd-criterion-coverage', 'taskPlanner'],
  ['entity-reference-integrity', 'contractDesigner'],
  ['gap-resolution-completeness', 'architectureWriter'],
  ['openapi-lint', 'contractDesigner'],
  ['migration-sql-parses', 'contractDesigner'],
  ['adr-completeness', 'architectureWriter'],
  ['patternRef-resolution', 'taskPlanner'],
  ['contextRef-resolution', 'taskPlanner'],
  ['acceptanceCriteria-coverage', 'taskPlanner'],
  ['tokenBudget-feasibility', 'taskPlanner'],
  ['mode-consistency', 'escalationGate'],
]);

/**
 * Look up the retry target for a specific gate name.
 * Returns 'escalationGate' for unknown gates (defensive).
 */
export function getRetryTargetForGate(gateName: string): RetryTarget {
  return GATE_RETRY_TARGETS.get(gateName) ?? 'escalationGate';
}

/**
 * Route after Critic based on per-gate retry matrix.
 *
 * - Critic passed → gate2Approval (HITL interrupt)
 * - Max retries exceeded → escalationGate (HITL interrupt)
 * - First failure → per-gate retry target from the routing matrix
 */
export function routeAfterCritic(state: ArchitectStateType): string {
  if (state.criticPassed) {
    debugLog('route: critic→gate2Approval (passed)');
    return 'gate2Approval';
  }

  if (state.criticRetries > MAX_CRITIC_RETRIES) {
    debugLog(
      `route: critic→escalationGate (retries=${state.criticRetries} > max=${MAX_CRITIC_RETRIES})`,
    );
    return 'escalationGate';
  }

  const failedGate = state.lastFailedGate;
  if (!failedGate) {
    debugLog('route: critic→escalationGate (no lastFailedGate)');
    return 'escalationGate';
  }

  const target = getRetryTargetForGate(failedGate);
  debugLog(
    `route: critic→${target} (gate '${failedGate}', retry ${state.criticRetries})`,
  );
  return target;
}
