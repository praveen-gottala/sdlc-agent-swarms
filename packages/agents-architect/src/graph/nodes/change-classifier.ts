/**
 * @module @agentforge/agents-architect/graph/nodes/change-classifier
 *
 * Node 0.5 — Change Classifier (brownfield only).
 * Classifies the change request against the existing codebase to produce
 * a ChangeClassification (scope axes, blast radius, affected modules).
 * Also populates the existingFiles channel from the repo snapshot.
 *
 * 1 Sonnet call → ChangeClassification + existingFiles set.
 */

import { debugLog } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

/** Create the Change Classifier node (Node 0.5). */
export function createChangeClassifier(_deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('changeClassifier: ENTER');

    const snapshot = state.existingRepoSnapshot;
    const existingFiles = snapshot
      ? new Set(snapshot.filePaths) as ReadonlySet<string>
      : null;

    // TODO: Phase 7 wires LLM call to produce ChangeClassification
    // For now, pass through with existingFiles populated from snapshot
    debugLog(`changeClassifier: EXIT existingFiles=${existingFiles?.size ?? 0}`);
    return { existingFiles };
  };
}
