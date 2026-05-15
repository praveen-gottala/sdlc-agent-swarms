/**
 * @module @agentforge/agents-architect/graph/nodes/context-assembler
 *
 * Node 1 — Context Assembler.
 * Greenfield: deterministic constraint extraction from EnrichedRequirement (no LLM).
 * Brownfield: 1 Sonnet call to produce repo-map digest capped at 20K tokens (R2 §7.6).
 *
 * Produces ConstraintSet for downstream nodes.
 */

import { debugLog } from '@agentforge/core';
import type { ConstraintSet } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

/** Create the Context Assembler node (Node 1). */
export function createContextAssembler(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog(`contextAssembler: ENTER mode=${state.mode}`);

    const req = state.enrichedRequirement;
    if (!req) {
      debugLog('contextAssembler: EXIT (no enrichedRequirement)');
      return {};
    }

    // Greenfield: deterministic constraint extraction
    const constraintSet: ConstraintSet = {
      projectId: deps.projectId,
      constraints: [],
      gaps: [],
      mode: state.mode,
    };

    // TODO: Brownfield path — 1 Sonnet call for repo-map digest
    // TODO: Populate constraints and gaps from enrichedRequirement analysis

    debugLog(`contextAssembler: EXIT constraints=${constraintSet.constraints.length} gaps=${constraintSet.gaps.length}`);
    return { constraintSet };
  };
}
