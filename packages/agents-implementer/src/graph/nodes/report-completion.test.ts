/**
 * Tests for reportCompletion node — verifies TaskCompletionReport
 * assembly from artifacts, errors, and metadata.
 */

import type { TaskNode, ImplementerContextMetadata } from '@agentforge/core';
import { createReportCompletion } from './report-completion.js';
import type { ImplementerDeps } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';
import type { ImplementerArtifact } from '../../types.js';

const mockDeps: ImplementerDeps = {
  provider: {} as ImplementerDeps['provider'],
  projectRoot: '/test',
  projectId: 'test',
};

function makeState(overrides: Partial<ImplementerStateType> = {}): ImplementerStateType {
  return {
    task: {
      id: 'T1', title: 'Test', description: 'Test',
      filePaths: ['src/test.ts'], dependencies: [], writeOrder: 0,
      type: 'backend', mode: 'NEW', estimatedTokenBudget: 10000,
      contextRefs: [], patternRefs: [], acceptanceCriteriaIds: [],
    } as TaskNode,
    contractBundle: null,
    existingDesignSpecs: null,
    projectRoot: '/test',
    implementerPrompt: '',
    metadata: {
      taskId: 'T1', taskType: 'NEW', sliceStrategy: 'none', designSpecIncluded: false,
    } as ImplementerContextMetadata,
    designResult: null,
    artifacts: [],
    completionReport: null,
    errors: [],
    ...overrides,
  };
}

describe('reportCompletion', () => {
  const node = createReportCompletion(mockDeps);

  it('populates filesWritten from artifacts', async () => {
    const artifacts: ImplementerArtifact[] = [
      { path: 'src/api.ts', action: 'created', contentHash: 'abc123' },
      { path: 'src/db.ts', action: 'created', contentHash: 'def456' },
    ];
    const result = await node(makeState({ artifacts }));

    expect(result.completionReport).toBeDefined();
    expect(result.completionReport!.taskId).toBe('T1');
    expect(result.completionReport!.filesWritten).toEqual(['src/api.ts', 'src/db.ts']);
  });

  it('populates deviationsFromContract from errors', async () => {
    const result = await node(makeState({
      errors: ['Assumption A1 violated', 'Missing dependency'],
    }));

    expect(result.completionReport!.deviationsFromContract).toEqual([
      'Assumption A1 violated',
      'Missing dependency',
    ]);
  });

  it('populates patternsApplied from metadata sliceStrategy', async () => {
    const result = await node(makeState({
      metadata: { taskId: 'T1', taskType: 'MODIFY', sliceStrategy: 'structure-only', designSpecIncluded: true },
    }));

    expect(result.completionReport!.patternsApplied).toEqual(['structure-only']);
  });

  it('handles empty artifacts and errors', async () => {
    const result = await node(makeState());

    expect(result.completionReport!.filesWritten).toEqual([]);
    expect(result.completionReport!.deviationsFromContract).toEqual([]);
  });

  it('uses "unknown" taskId when no task present', async () => {
    const result = await node(makeState({ task: null }));
    expect(result.completionReport!.taskId).toBe('unknown');
  });
});
