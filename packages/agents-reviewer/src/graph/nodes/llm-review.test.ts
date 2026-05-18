/**
 * Tests for llmReview node — mock LLM for review path;
 * governance gate bypass; schema validation.
 */

import { Ok } from '@agentforge/core';
import type { Diff, AssumptionLedger, TaskCompletionReport } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { createLlmReview } from './llm-review.js';
import type { ReviewerDeps } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';
import type { GateResult } from '../../types.js';

function makeMockProvider(response: Record<string, unknown>): LLMProvider {
  return {
    name: 'test',
    models: ['test-model'],
    complete: jest.fn().mockResolvedValue(
      Ok({
        content: JSON.stringify(response),
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 },
        model: 'test-model',
        latencyMs: 100,
        finishReason: 'stop' as const,
        structured: response,
      }),
    ),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
    estimateCost: jest.fn().mockReturnValue({ inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0 }),
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
      hunks: [{ startLine: 1, endLine: 5, content: '+ fixed bug' }],
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
  patternsApplied: [],
  deviationsFromContract: [],
};

const ALL_PASSED_GATES: GateResult[] = [
  { name: 'file-path-coverage', passed: true, detail: 'All files covered' },
  { name: 'single-writer', passed: true, detail: 'No duplicates' },
  { name: 'governance-scan', passed: true, detail: 'Clean' },
];

function makeState(overrides: Partial<ReviewerStateType> = {}): ReviewerStateType {
  return {
    diff: SAMPLE_DIFF,
    assumptionLedger: null,
    contractBundle: null,
    taskCompletionReport: SAMPLE_REPORT,
    gateResults: ALL_PASSED_GATES,
    gatesPassed: true,
    assumptionValidationResults: [],
    reviewResult: null,
    errors: [],
    ...overrides,
  };
}

describe('llmReview', () => {
  it('produces approved ReviewResult with no findings', async () => {
    const provider = makeMockProvider({
      findings: [],
      outcome: 'approved',
    });

    const deps: ReviewerDeps = {
      provider,
      projectRoot: '/tmp/test',
      projectId: 'test',
    };

    const node = createLlmReview(deps);
    const result = await node(makeState());

    expect(result.reviewResult).toBeDefined();
    expect(result.reviewResult!.outcome).toBe('approved');
    expect(result.reviewResult!.findings).toHaveLength(0);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('produces rejected ReviewResult with blocking findings', async () => {
    const provider = makeMockProvider({
      findings: [
        {
          id: 'f1',
          category: 'blocking',
          description: 'Missing null check',
          file: 'src/main.ts',
          line: 3,
          evidence: 'Line 3 dereferences without check',
        },
      ],
      outcome: 'rejected',
    });

    const deps: ReviewerDeps = {
      provider,
      projectRoot: '/tmp/test',
      projectId: 'test',
    };

    const node = createLlmReview(deps);
    const result = await node(makeState());

    expect(result.reviewResult!.outcome).toBe('rejected');
    expect(result.reviewResult!.findings).toHaveLength(1);
    expect(result.reviewResult!.findings[0].category).toBe('blocking');
  });

  it('escalates when governance gate failed (skips LLM)', async () => {
    const provider = makeMockProvider({ findings: [], outcome: 'approved' });

    const deps: ReviewerDeps = {
      provider,
      projectRoot: '/tmp/test',
      projectId: 'test',
    };

    const failedGates: GateResult[] = [
      { name: 'governance-scan', passed: false, detail: 'secret found' },
    ];

    const node = createLlmReview(deps);
    const result = await node(makeState({
      gateResults: failedGates,
      gatesPassed: false,
    }));

    expect(result.reviewResult!.outcome).toBe('escalated');
    expect(result.reviewResult!.findings.length).toBeGreaterThan(0);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('does not include assumption content in prompt after split', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'Database supports JSON columns',
          evidence: 'Checked PostgreSQL docs',
          confidence: 0.9,
          blastRadius: 'medium',
          requiresConfirmation: false,
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const provider = makeMockProvider({
      findings: [],
      outcome: 'approved',
    });

    const deps: ReviewerDeps = {
      provider,
      projectRoot: '/tmp/test',
      projectId: 'test',
    };

    const node = createLlmReview(deps);
    const result = await node(makeState({ assumptionLedger: ledger }));

    expect(result.reviewResult!.assumptionViolations).toEqual([]);

    const callArgs = (provider.complete as jest.Mock).mock.calls[0];
    const promptContent = callArgs[0].messages[0].content as string;
    expect(promptContent).not.toContain('Assumption Ledger');
    expect(promptContent).not.toContain('Validate the diff against the assumption ledger');
  });
});
