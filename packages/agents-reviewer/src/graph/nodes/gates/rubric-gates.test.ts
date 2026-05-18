/**
 * Tests for rubric gates — plan coverage, scope classification,
 * dead-code hints with fixture diffs.
 */

import type { Diff } from '@agentforge/core';
import { runRubricGates } from './rubric-gates.js';

function makeDiff(overrides: Partial<Diff> = {}): Diff {
  return {
    id: 'diff-1',
    taskId: 'task-1',
    worktreeBranch: 'feat/test',
    files: [],
    testsPassed: true,
    typecheckPassed: true,
    lintPassed: true,
    ...overrides,
  };
}

describe('rubricGates', () => {
  it('returns empty array when diff is null', () => {
    expect(runRubricGates(null, null)).toEqual([]);
  });

  it('passes all gates when no plan available', () => {
    const diff = makeDiff({
      files: [{ path: 'src/main.ts', operation: 'modify', hunks: [] }],
    });

    const results = runRubricGates(diff, null);
    expect(results.every((r) => r.passed)).toBe(true);
    expect(results.length).toBe(3);
  });

  it('fails plan-file-coverage when plan file missing from diff', () => {
    const diff = makeDiff({
      files: [{ path: 'src/main.ts', operation: 'modify', hunks: [] }],
    });

    const results = runRubricGates(diff, ['src/main.ts', 'src/missing.ts']);
    const gate = results.find((r) => r.name === 'plan-file-coverage');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('missing.ts');
  });

  it('passes plan-file-coverage when all plan files in diff', () => {
    const diff = makeDiff({
      files: [
        { path: 'src/main.ts', operation: 'modify', hunks: [] },
        { path: 'src/utils.ts', operation: 'modify', hunks: [] },
      ],
    });

    const results = runRubricGates(diff, ['src/main.ts', 'src/utils.ts']);
    const gate = results.find((r) => r.name === 'plan-file-coverage');
    expect(gate?.passed).toBe(true);
  });

  it('fails scope-creep-classification when diff has unplanned files', () => {
    const diff = makeDiff({
      files: [
        { path: 'src/planned.ts', operation: 'modify', hunks: [] },
        { path: 'src/extra.ts', operation: 'add', hunks: [] },
      ],
    });

    const results = runRubricGates(diff, ['src/planned.ts']);
    const gate = results.find((r) => r.name === 'scope-creep-classification');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('extra.ts');
  });

  it('detects potentially unused imports as dead-code-hint', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/module.ts',
        operation: 'modify',
        hunks: [{
          startLine: 1,
          endLine: 10,
          content: '+ import { unusedHelper } from "./helpers.js";\n+ const x = 1;',
        }],
      }],
    });

    const results = runRubricGates(diff, null);
    const gate = results.find((r) => r.name === 'dead-code-hint');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('unusedHelper');
  });

  it('passes dead-code-hint when imported name is used in diff', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/module.ts',
        operation: 'modify',
        hunks: [{
          startLine: 1,
          endLine: 10,
          content: '+ import { helper } from "./helpers.js";\n+ const result = helper();',
        }],
      }],
    });

    const results = runRubricGates(diff, null);
    const gate = results.find((r) => r.name === 'dead-code-hint');
    expect(gate?.passed).toBe(true);
  });
});
