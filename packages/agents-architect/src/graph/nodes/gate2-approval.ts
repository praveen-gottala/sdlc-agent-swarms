/**
 * @module @agentforge/agents-architect/graph/nodes/gate2-approval
 *
 * Gate 2 Approval — HITL structural interrupt (vision Layer 10).
 * No-op pass-through node; the interrupt is the gate.
 * interruptBefore fires on this node, pausing the graph for human review.
 * The human's decision lands in gate2Decision + gate2Edits channels
 * via graph.updateState() before stream(null) resumes.
 */

import { debugLog } from '@agentforge/core';
import type { ArchitectStateType } from '../state.js';

/** Gate 2 Approval node — no-op pass-through. */
export async function gate2Approval(state: ArchitectStateType): Promise<Partial<ArchitectStateType>> {
  debugLog(`gate2Approval: ENTER decision=${state.gate2Decision ?? 'pending'}`);
  return {};
}
