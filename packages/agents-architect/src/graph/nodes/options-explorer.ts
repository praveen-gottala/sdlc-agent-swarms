/**
 * @module @agentforge/agents-architect/graph/nodes/options-explorer
 *
 * Node 2 — Options Explorer.
 * For each gap in the ConstraintSet, generates 3-6 parallel Sonnet calls
 * to explore alternative solutions. Produces an OptionsBundle.
 */

import { debugLog } from '@agentforge/core';
import type { OptionsBundle } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

/** Create the Options Explorer node (Node 2). */
export function createOptionsExplorer(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('optionsExplorer: ENTER');

    const constraintSet = state.constraintSet;
    if (!constraintSet) {
      debugLog('optionsExplorer: EXIT (no constraintSet)');
      return {};
    }

    // TODO: Phase 4+ — parallel Sonnet calls per gap
    const optionsBundle: OptionsBundle = {
      projectId: deps.projectId,
      memos: [],
    };

    debugLog(`optionsExplorer: EXIT memos=${optionsBundle.memos.length}`);
    return { optionsBundle };
  };
}
