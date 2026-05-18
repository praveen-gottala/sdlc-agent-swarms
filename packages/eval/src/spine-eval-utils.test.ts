import type { TaskNode } from '@agentforge/core';
import { selectTask, buildDiffFromArtifacts } from './spine-eval-utils.js';

function makeTask(overrides: Partial<TaskNode> & { id: string }): TaskNode {
  return {
    title: overrides.id,
    description: '',
    filePaths: [],
    dependencies: [],
    writeOrder: 0,
    type: 'frontend',
    mode: 'NEW',
    estimatedTokenBudget: 1000,
    contextRefs: [],
    patternRefs: [],
    acceptanceCriteriaIds: [],
    ...overrides,
  };
}

const makeTasks = (): TaskNode[] => [
  makeTask({ id: 'task-1', type: 'frontend', mode: 'NEW', filePaths: ['a.ts'] }),
  makeTask({ id: 'task-2', type: 'backend', mode: 'MODIFY', filePaths: ['b.ts'], dependencies: ['task-1'] }),
  makeTask({ id: 'task-3', type: 'frontend', mode: 'MODIFY', filePaths: ['c.ts'] }),
];

describe('selectTask', () => {
  const tasks = makeTasks();

  it('mode=first returns the first task', () => {
    const result = selectTask(tasks, { mode: 'first' });
    expect(result?.id).toBe('task-1');
  });

  it('mode=first returns undefined for empty array', () => {
    const result = selectTask([], { mode: 'first' });
    expect(result).toBeUndefined();
  });

  it('mode=by-id finds a matching task', () => {
    const result = selectTask(tasks, { mode: 'by-id', taskId: 'task-2' });
    expect(result?.id).toBe('task-2');
  });

  it('mode=by-id returns undefined for unknown id', () => {
    const result = selectTask(tasks, { mode: 'by-id', taskId: 'task-999' });
    expect(result).toBeUndefined();
  });

  it('mode=by-type matches taskType only', () => {
    const result = selectTask(tasks, { mode: 'by-type', taskType: 'backend' });
    expect(result?.id).toBe('task-2');
  });

  it('mode=by-type matches taskMode only', () => {
    const result = selectTask(tasks, { mode: 'by-type', taskMode: 'MODIFY' });
    expect(result?.id).toBe('task-2');
  });

  it('mode=by-type matches both taskType and taskMode', () => {
    const result = selectTask(tasks, { mode: 'by-type', taskType: 'frontend', taskMode: 'MODIFY' });
    expect(result?.id).toBe('task-3');
  });

  it('mode=by-type returns undefined when no match', () => {
    const result = selectTask(tasks, { mode: 'by-type', taskType: 'test' });
    expect(result).toBeUndefined();
  });
});

describe('buildDiffFromArtifacts', () => {
  it('maps created action to add operation', () => {
    const diff = buildDiffFromArtifacts(
      [{ path: 'src/new-file.ts', action: 'created' }],
      'task-1',
    );
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0].operation).toBe('add');
    expect(diff.files[0].path).toBe('src/new-file.ts');
  });

  it('maps non-created action to modify operation', () => {
    const diff = buildDiffFromArtifacts(
      [{ path: 'src/existing.ts', action: 'modified' }],
      'task-1',
    );
    expect(diff.files[0].operation).toBe('modify');
  });

  it('sets correct metadata fields', () => {
    const diff = buildDiffFromArtifacts([], 'task-42');
    expect(diff.id).toBe('eval-diff-task-42');
    expect(diff.taskId).toBe('task-42');
    expect(diff.worktreeBranch).toBe('eval-task-42');
    expect(diff.testsPassed).toBe(true);
    expect(diff.typecheckPassed).toBe(true);
    expect(diff.lintPassed).toBe(true);
  });

  it('handles multiple artifacts', () => {
    const diff = buildDiffFromArtifacts(
      [
        { path: 'a.ts', action: 'created' },
        { path: 'b.ts', action: 'updated' },
        { path: 'c.ts', action: 'created' },
      ],
      'task-1',
    );
    expect(diff.files).toHaveLength(3);
    expect(diff.files.map((f: { operation: string }) => f.operation)).toEqual(['add', 'modify', 'add']);
  });
});
