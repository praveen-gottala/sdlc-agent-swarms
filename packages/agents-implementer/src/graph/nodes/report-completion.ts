/**
 * @module report-completion
 *
 * Implementer Node 4: assembles the TaskCompletionReport from
 * artifacts, errors, and metadata. Deterministic — no LLM call.
 */

import { debugLog } from '@agentforge/core';
import type { TaskCompletionReport } from '@agentforge/core';
import type { ImplementerDeps, ImplementerNodeFn } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';

export function createReportCompletion(_deps: ImplementerDeps): ImplementerNodeFn {
  return async (state: ImplementerStateType): Promise<Partial<ImplementerStateType>> => {
    debugLog('reportCompletion: ENTER');

    const report: TaskCompletionReport = {
      taskId: state.task?.id ?? 'unknown',
      filesWritten: state.artifacts.map((a) => a.path),
      interfacesExposed: [],
      patternsApplied: state.metadata?.sliceStrategy
        ? [state.metadata.sliceStrategy]
        : [],
      deviationsFromContract: [...state.errors],
    };

    debugLog(
      `reportCompletion: EXIT — ${report.filesWritten.length} files, ` +
      `${report.deviationsFromContract.length} deviations`,
    );

    return { completionReport: report };
  };
}
