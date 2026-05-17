/**
 * @module load-task-context
 *
 * Implementer Node 1: assembles the system prompt from the task,
 * sliced contract bundle, and optional design context.
 * Deterministic — no LLM call.
 */

import { debugLog } from '@agentforge/core';
import { buildImplementerPrompt } from '../../context/build-implementer-prompt.js';
import type { ImplementerDeps, ImplementerNodeFn } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';

export function createLoadTaskContext(_deps: ImplementerDeps): ImplementerNodeFn {
  return async (state: ImplementerStateType): Promise<Partial<ImplementerStateType>> => {
    debugLog('loadTaskContext: ENTER');

    if (!state.task) {
      debugLog('loadTaskContext: no task — skipping');
      return { errors: ['loadTaskContext: no task provided'] };
    }

    const result = buildImplementerPrompt({
      task: state.task,
      contractBundle: state.contractBundle ?? {},
      existingDesignSpecs: state.existingDesignSpecs ?? undefined,
      projectRoot: state.projectRoot,
    });

    debugLog(
      `loadTaskContext: EXIT — prompt ${result.prompt.length} chars, ` +
      `sliceStrategy=${result.metadata.sliceStrategy}, ` +
      `designSpecIncluded=${result.metadata.designSpecIncluded}`,
    );

    return {
      implementerPrompt: result.prompt,
      metadata: result.metadata,
    };
  };
}
