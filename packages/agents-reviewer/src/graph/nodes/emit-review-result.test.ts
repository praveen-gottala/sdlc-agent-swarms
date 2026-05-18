/**
 * Tests for emitReviewResult node — verifies gate/LLM result
 * merging and outcome reconciliation.
 */

import type { ReviewResult } from '@agentforge/core';
import { createEmitReviewResult } from './emit-review-result.js';
import type { ReviewerDeps } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import type { GateResult, AssumptionValidationResult } from '../../types.js';

const MOCK_DEPS: ReviewerDeps = {
  provider: {} as ReviewerDeps['provider'],
  projectRoot: '/tmp/test',
  projectId: 'test',
};

function makeState(overrides: Partial<ReviewerStateType> = {}): ReviewerStateType {
  return {
    diff: { id: 'd1', taskId: 't1', worktreeBranch: 'b', files: [], testsPassed: true, typecheckPassed: true, lintPassed: true },
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

describe('emitReviewResult', () => {
  const emitter = createEmitReviewResult(MOCK_DEPS);

  it('passes through approved LLM result when gates pass', async () => {
    const llmResult: ReviewResult = {
      id: 'r1',
      diffId: 'd1',
      findings: [],
      assumptionViolations: [],
      outcome: 'approved',
      revisionCount: 0,
    };

    const result = await emitter(makeState({
      reviewResult: llmResult,
      gateResults: [{ name: 'test-gate', passed: true, detail: 'ok' }],
    }));

    expect(result.reviewResult!.outcome).toBe('approved');
    expect(result.reviewResult!.findings).toHaveLength(0);
  });

  it('overrides approved to rejected when gate has blocking failure', async () => {
    const llmResult: ReviewResult = {
      id: 'r1',
      diffId: 'd1',
      findings: [],
      assumptionViolations: [],
      outcome: 'approved',
      revisionCount: 0,
    };

    const failedGate: GateResult = {
      name: 'file-path-coverage',
      passed: false,
      detail: 'Missing file',
    };

    const result = await emitter(makeState({
      reviewResult: llmResult,
      gateResults: [failedGate],
    }));

    expect(result.reviewResult!.outcome).toBe('rejected');
    expect(result.reviewResult!.findings.length).toBeGreaterThan(0);
    expect(result.reviewResult!.findings[0].description).toContain('file-path-coverage');
  });

  it('escalates when no LLM result is present', async () => {
    const result = await emitter(makeState({ reviewResult: null }));

    expect(result.reviewResult!.outcome).toBe('escalated');
  });

  it('preserves LLM findings and merges gate findings', async () => {
    const llmResult: ReviewResult = {
      id: 'r1',
      diffId: 'd1',
      findings: [
        {
          id: 'f1',
          category: 'suggestion',
          description: 'Consider using const',
          file: 'src/main.ts',
          evidence: 'let used where const works',
        },
      ],
      assumptionViolations: [],
      outcome: 'approved',
      revisionCount: 0,
    };

    const failedGate: GateResult = {
      name: 'single-writer',
      passed: false,
      detail: 'Duplicate entries for src/utils.ts',
    };

    const result = await emitter(makeState({
      reviewResult: llmResult,
      gateResults: [failedGate],
    }));

    expect(result.reviewResult!.findings).toHaveLength(2);
    expect(result.reviewResult!.outcome).toBe('rejected');
  });

  it('merges assumption violations from assumptionValidationResults', async () => {
    const llmResult: ReviewResult = {
      id: 'r1',
      diffId: 'd1',
      findings: [],
      assumptionViolations: [],
      outcome: 'approved',
      revisionCount: 0,
    };

    const validationResults: AssumptionValidationResult[] = [
      { assumptionId: 'a1', violated: true, evidence: 'contradicted', severity: 'warning' },
      { assumptionId: 'a2', violated: false, evidence: 'consistent', severity: 'warning' },
    ];

    const result = await emitter(makeState({
      reviewResult: llmResult,
      assumptionValidationResults: validationResults,
    }));

    expect(result.reviewResult!.assumptionViolations).toEqual(['a1']);
    expect(result.reviewResult!.outcome).toBe('approved');
  });

  it('overrides approved to rejected when assumption violation is blocking', async () => {
    const llmResult: ReviewResult = {
      id: 'r1',
      diffId: 'd1',
      findings: [],
      assumptionViolations: [],
      outcome: 'approved',
      revisionCount: 0,
    };

    const validationResults: AssumptionValidationResult[] = [
      { assumptionId: 'a1', violated: true, evidence: 'critical breach', severity: 'blocking' },
    ];

    const result = await emitter(makeState({
      reviewResult: llmResult,
      assumptionValidationResults: validationResults,
    }));

    expect(result.reviewResult!.assumptionViolations).toEqual(['a1']);
    expect(result.reviewResult!.outcome).toBe('rejected');
  });
});
