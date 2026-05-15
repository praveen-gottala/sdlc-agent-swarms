/**
 * @module @agentforge/agents-architect/graph/nodes/escalation-gate
 *
 * Escalation Gate — HITL interrupt after max retries.
 * No-op pass-through; interruptBefore fires on this node.
 * Humans decide whether to force-approve, edit, or abort.
 */

import { debugLog } from '@agentforge/core';
import type { ArchitectStateType } from '../state.js';

/** Escalation Gate node — no-op pass-through. */
export async function escalationGate(state: ArchitectStateType): Promise<Partial<ArchitectStateType>> {
  debugLog(`escalationGate: ENTER retries=${state.criticRetries}`);
  return {};
}
