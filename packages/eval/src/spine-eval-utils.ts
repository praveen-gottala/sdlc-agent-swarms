/**
 * Pure utility functions for the spine eval runner.
 * Extracted for testability — no side effects, no imports beyond core types.
 */

import type { TaskNode, Diff } from '@agentforge/core';
import type { SpineEvalScenario } from './types.js';

export function selectTask(
  tasks: readonly TaskNode[],
  selector: SpineEvalScenario['architect']['taskSelector'],
): TaskNode | undefined {
  switch (selector.mode) {
    case 'first':
      return tasks[0];
    case 'by-id':
      return tasks.find((t) => t.id === selector.taskId);
    case 'by-type':
      return tasks.find((t) => {
        const typeMatch = !selector.taskType || t.type === selector.taskType;
        const modeMatch = !selector.taskMode || t.mode === selector.taskMode;
        return typeMatch && modeMatch;
      });
    default: {
      const _exhaustive: never = selector.mode;
      throw new Error(`Unknown task selector mode: ${String(_exhaustive)}`);
    }
  }
}

export function buildDiffFromArtifacts(
  artifacts: readonly { path: string; action: string }[],
  taskId: string,
): Diff {
  return {
    id: `eval-diff-${taskId}`,
    taskId,
    worktreeBranch: `eval-${taskId}`,
    files: artifacts.map((a) => ({
      path: a.path,
      operation: a.action === 'created' ? 'add' as const : 'modify' as const,
      hunks: [],
    })),
    testsPassed: true,
    typecheckPassed: true,
    lintPassed: true,
  };
}
