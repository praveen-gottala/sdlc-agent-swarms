/**
 * Tests for deterministicGates node — verifies each gate
 * catches the expected condition and the aggregate pass/fail.
 */

import type { Diff, TaskCompletionReport } from '@agentforge/core';
import { createDeterministicGates } from './deterministic-gates.js';
import type { ReviewerDeps } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';

const MOCK_DEPS: ReviewerDeps = {
  provider: {} as ReviewerDeps['provider'],
  projectRoot: '/tmp/test-project',
  projectId: 'test-project',
};

function makeState(overrides: Partial<ReviewerStateType> = {}): ReviewerStateType {
  return {
    diff: null,
    assumptionLedger: null,
    contractBundle: null,
    taskCompletionReport: null,
    gateResults: [],
    gatesPassed: true,
    assumptionValidationResults: [],
    reviewResult: null,
    errors: [],
    ...overrides,
  };
}

const SAMPLE_DIFF: Diff = {
  id: 'diff-1',
  taskId: 'task-1',
  worktreeBranch: 'feat/test',
  files: [
    {
      path: 'src/main.ts',
      operation: 'modify',
      hunks: [{ startLine: 1, endLine: 10, content: '+ added line' }],
    },
  ],
  testsPassed: true,
  typecheckPassed: true,
  lintPassed: true,
};

const SAMPLE_REPORT: TaskCompletionReport = {
  taskId: 'task-1',
  filesWritten: ['src/main.ts'],
  interfacesExposed: [],
  patternsApplied: ['structure-only'],
  deviationsFromContract: [],
};

describe('deterministicGates', () => {
  const gates = createDeterministicGates(MOCK_DEPS);

  it('passes all gates when diff matches completion report', async () => {
    const result = await gates(makeState({
      diff: SAMPLE_DIFF,
      taskCompletionReport: SAMPLE_REPORT,
    }));

    expect(result.gatesPassed).toBe(true);
    expect(result.gateResults).toBeDefined();
    const results = result.gateResults!;
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('fails file-path-coverage when diff has undeclared file', async () => {
    const diffWithExtra: Diff = {
      ...SAMPLE_DIFF,
      files: [
        ...SAMPLE_DIFF.files,
        {
          path: 'src/sneaky.ts',
          operation: 'add',
          hunks: [{ startLine: 1, endLine: 5, content: '+ new file' }],
        },
      ],
    };

    const result = await gates(makeState({
      diff: diffWithExtra,
      taskCompletionReport: SAMPLE_REPORT,
    }));

    expect(result.gatesPassed).toBe(false);
    const coverageGate = result.gateResults!.find(
      (g) => g.name === 'file-path-coverage',
    );
    expect(coverageGate?.passed).toBe(false);
    expect(coverageGate?.detail).toContain('sneaky.ts');
  });

  it('fails governance gate when report has secret deviation', async () => {
    const reportWithSecret: TaskCompletionReport = {
      ...SAMPLE_REPORT,
      deviationsFromContract: ['Hardcoded secret found in config.ts'],
    };

    const result = await gates(makeState({
      diff: SAMPLE_DIFF,
      taskCompletionReport: reportWithSecret,
    }));

    expect(result.gatesPassed).toBe(false);
    const govGate = result.gateResults!.find(
      (g) => g.name === 'governance-scan',
    );
    expect(govGate?.passed).toBe(false);
    expect(govGate?.detail).toContain('secret');
  });

  it('fails when diff or report is missing', async () => {
    const result = await gates(makeState());

    expect(result.gatesPassed).toBe(false);
    const coverageGate = result.gateResults!.find(
      (g) => g.name === 'file-path-coverage',
    );
    expect(coverageGate?.passed).toBe(false);
    expect(coverageGate?.detail).toContain('Missing');
  });

  it('fails single-writer when file appears in duplicate diff entries', async () => {
    const dupDiff: Diff = {
      ...SAMPLE_DIFF,
      files: [
        { path: 'src/main.ts', operation: 'modify', hunks: [] },
        { path: 'src/main.ts', operation: 'add', hunks: [] },
      ],
    };

    const result = await gates(makeState({
      diff: dupDiff,
      taskCompletionReport: {
        ...SAMPLE_REPORT,
        filesWritten: ['src/main.ts'],
      },
    }));

    const swGate = result.gateResults!.find(
      (g) => g.name === 'single-writer',
    );
    expect(swGate?.passed).toBe(false);
    expect(swGate?.detail).toContain('main.ts');
  });
});
