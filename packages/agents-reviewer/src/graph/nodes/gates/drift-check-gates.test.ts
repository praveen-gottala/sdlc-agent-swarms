/**
 * Tests for drift-check gates — each gate tested with a fixture diff
 * that triggers the specific pattern.
 */

import type { Diff, ContractBundle } from '@agentforge/core';
import { runDriftCheckGates } from './drift-check-gates.js';

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

describe('driftCheckGates', () => {
  it('returns empty array when diff is null', () => {
    expect(runDriftCheckGates(null, null)).toEqual([]);
  });

  it('passes all gates on clean diff', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/main.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ const x = 1;' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    expect(results.every((r) => r.passed)).toBe(true);
    expect(results.length).toBe(8);
  });

  it('fails mocks-in-prod when jest.fn() in production file', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/service.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ const mock = jest.fn();' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'mocks-in-prod');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('service.ts');
  });

  it('allows mocks in test files', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/service.test.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ const mock = jest.fn();' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'mocks-in-prod');
    expect(gate?.passed).toBe(true);
  });

  it('fails test-coverage-gap when new .ts file has no .test.ts', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/new-module.ts',
        operation: 'add',
        hunks: [{ startLine: 1, endLine: 5, content: '+ export function foo() {}' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'test-coverage-gap');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('new-module.ts');
  });

  it('passes test-coverage-gap when companion test exists', () => {
    const diff = makeDiff({
      files: [
        { path: 'src/new-module.ts', operation: 'add', hunks: [{ startLine: 1, endLine: 1, content: '+ export const x = 1;' }] },
        { path: 'src/new-module.test.ts', operation: 'add', hunks: [{ startLine: 1, endLine: 1, content: '+ test("x", () => {});' }] },
      ],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'test-coverage-gap');
    expect(gate?.passed).toBe(true);
  });

  it('fails skipped-tests when .skip( in test file', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/foo.test.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ it.skip("broken test", () => {});' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'skipped-tests');
    expect(gate?.passed).toBe(false);
  });

  it('fails commented-out-code when commented import in prod', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/main.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ // import { foo } from "bar";' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'commented-out-code');
    expect(gate?.passed).toBe(false);
  });

  it('fails any-type-usage when as any in prod', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/utils.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ const x = value as any;' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'any-type-usage');
    expect(gate?.passed).toBe(false);
  });

  it('fails console-log-in-prod for non-script prod files', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/handler.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ console.log("debug");' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'console-log-in-prod');
    expect(gate?.passed).toBe(false);
  });

  it('allows console.log in script files', () => {
    const diff = makeDiff({
      files: [{
        path: 'scripts/migrate.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ console.log("migrating...");' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'console-log-in-prod');
    expect(gate?.passed).toBe(true);
  });

  it('fails scope-creep-vs-taskplan when diff has unplanned files', () => {
    const diff = makeDiff({
      files: [
        { path: 'src/planned.ts', operation: 'modify', hunks: [] },
        { path: 'src/sneaky.ts', operation: 'modify', hunks: [] },
      ],
    });

    const bundle: Partial<ContractBundle> = {
      taskPlan: {
        projectId: 'test',
        tasks: [{
          id: 't1',
          title: 'Task 1',
          description: 'Do something',
          filePaths: ['src/planned.ts'],
          dependencies: [],
          writeOrder: 0,
          type: 'backend',
          mode: 'NEW',
          estimatedTokenBudget: 5000,
          contextRefs: [],
          patternRefs: [],
          acceptanceCriteriaIds: [],
        }],
        featureCoverage: {},
      },
    };

    const results = runDriftCheckGates(diff, bundle);
    const gate = results.find((r) => r.name === 'scope-creep-vs-taskplan');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('sneaky.ts');
  });

  it('fails superseded-pattern when createMockFs in prod', () => {
    const diff = makeDiff({
      files: [{
        path: 'src/context.ts',
        operation: 'modify',
        hunks: [{ startLine: 1, endLine: 5, content: '+ const fs = createMockFs();' }],
      }],
    });

    const results = runDriftCheckGates(diff, null);
    const gate = results.find((r) => r.name === 'superseded-pattern');
    expect(gate?.passed).toBe(false);
    expect(gate?.detail).toContain('createMockFs');
  });
});
