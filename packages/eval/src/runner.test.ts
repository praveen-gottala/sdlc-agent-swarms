/**
 * Fixture-based tests for runScenario.
 * Mocks compileClarifierGraph at the module boundary to avoid LLM calls.
 * Resume pattern: updateState + stream(null).
 */

import type { ClarifierState } from '@agentforge/agents-clarifier';
import type { LLMProvider } from '@agentforge/providers';
import type { CostEstimate } from '@agentforge/core';
import type { EvalScenario } from './types.js';

const mockStream = jest.fn();
const mockGetState = jest.fn();
const mockUpdateState = jest.fn();

jest.mock('@agentforge/agents-clarifier', () => ({
  compileClarifierGraph: jest.fn(() => ({
    stream: mockStream,
    getState: mockGetState,
    updateState: mockUpdateState,
  })),
}));

jest.mock('./metrics/clarifier-metrics.js', () => ({
  computeMetrics: jest.fn(
    (scenarioId: string, threadId: string, _state: unknown, _cost: unknown, durationMs: number) => ({
      scenarioId,
      threadId,
      totalQuestions: 5,
      roundCount: 1,
      gapOverlapRatio: 0.0,
      prdDiffBytes: null,
      prdHashEqualAcrossRounds: null,
      totalCostUsd: 0,
      durationMs,
    }),
  ),
}));

import { runScenario } from './runner.js';

const STUB_PROVIDER: LLMProvider = {
  name: 'stub',
  models: ['stub-model'],
  complete: jest.fn(),
  stream: jest.fn() as unknown as LLMProvider['stream'],
  isAvailable: jest.fn(async () => true),
  estimateCost: jest.fn((): CostEstimate => ({
    estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'low',
  })),
};

const SCENARIO: EvalScenario = {
  id: 'test-scenario',
  name: 'Test',
  description: 'test',
  rawInput: 'Build a test app',
  mode: 'bootstrap',
  maxRounds: 3,
  expectedBehavior: { minQuestions: 1, maxQuestions: 15, expectEscalation: false },
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'test',
    mode: 'bootstrap' as const,
    context: {},
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 1,
    maxRounds: 3,
    error: null,
    prdDraft: null,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: true,
    escalationDecision: null,
    threadId: 'test-thread',
    ...overrides,
  };
}

describe('runScenario', () => {
  beforeEach(() => {
    mockStream.mockReset();
    mockGetState.mockReset();
    mockUpdateState.mockReset().mockResolvedValue(undefined);
  });

  it('returns metrics on successful non-interrupted run', async () => {
    mockStream.mockResolvedValueOnce([{ contextRetriever: {} }, { emitComplete: {} }]);
    mockGetState.mockResolvedValueOnce({ values: makeState(), next: [] });

    const result = await runScenario(SCENARIO, STUB_PROVIDER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scenarioId).toBe('test-scenario');
    }
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockUpdateState).not.toHaveBeenCalled();
  });

  it('handles interrupt/resume with updateState + stream(null)', async () => {
    // First call: interrupt
    mockStream.mockResolvedValueOnce([{ questionPrioritizer: {} }]);
    mockGetState.mockResolvedValueOnce({
      values: makeState({
        round: 1,
        questions: [{ id: 'q1', gapId: 'g1', text: 'What?', type: 'open' as const, priority: 1, evpiScore: 0.5 }],
      }),
      next: ['storyWriter'],
    });
    // Second call: complete
    mockStream.mockResolvedValueOnce([{ storyWriter: {} }, { critic: {} }, { emitComplete: {} }]);
    mockGetState.mockResolvedValueOnce({ values: makeState(), next: [] });

    const result = await runScenario(SCENARIO, STUB_PROVIDER);
    expect(result.ok).toBe(true);
    expect(mockStream).toHaveBeenCalledTimes(2);
    expect(mockUpdateState).toHaveBeenCalledTimes(1);

    // Verify updateState was called with humanResponses
    const updateCall = mockUpdateState.mock.calls[0]!;
    expect(updateCall[1]).toHaveProperty('humanResponses');

    // Verify stream(null) for resume
    const secondStreamCall = mockStream.mock.calls[1]!;
    expect(secondStreamCall[0]).toBeNull();
  });

  it('times out on hung pipeline', async () => {
    mockStream.mockImplementation(() => new Promise(() => { /* never resolves */ }));

    const result = await runScenario(SCENARIO, STUB_PROVIDER, 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  }, 5000);

  it('respects maxAnswersPerRound', async () => {
    const scenarioWithMax: EvalScenario = { ...SCENARIO, maxAnswersPerRound: 1 };

    mockStream.mockResolvedValueOnce([{ questionPrioritizer: {} }]);
    mockGetState.mockResolvedValueOnce({
      values: makeState({
        questions: [
          { id: 'q1', gapId: 'g1', text: 'A?', type: 'open' as const, priority: 1, evpiScore: 0.5 },
          { id: 'q2', gapId: 'g2', text: 'B?', type: 'open' as const, priority: 2, evpiScore: 0.3 },
        ],
      }),
      next: ['storyWriter'],
    });
    mockStream.mockResolvedValueOnce([{ emitComplete: {} }]);
    mockGetState.mockResolvedValueOnce({ values: makeState(), next: [] });

    await runScenario(scenarioWithMax, STUB_PROVIDER);

    const updateCall = mockUpdateState.mock.calls[0]![1] as Record<string, unknown>;
    expect((updateCall.humanResponses as unknown[]).length).toBe(1);
  });

  it('provides escalationDecision when round >= maxRounds', async () => {
    mockStream.mockResolvedValueOnce([{ questionPrioritizer: {} }]);
    mockGetState.mockResolvedValueOnce({
      values: makeState({
        round: 3,
        maxRounds: 3,
        questions: [{ id: 'q1', gapId: 'g1', text: 'A?', type: 'open' as const, priority: 1, evpiScore: 0.5 }],
      }),
      next: ['escalationGate'],
    });
    mockStream.mockResolvedValueOnce([{ emitComplete: {} }]);
    mockGetState.mockResolvedValueOnce({ values: makeState(), next: [] });

    await runScenario(SCENARIO, STUB_PROVIDER);

    const updateCall = mockUpdateState.mock.calls[0]![1] as Record<string, unknown>;
    expect(updateCall.escalationDecision).toBe('accept');
  });

  it('calls progress callback on each node', async () => {
    mockStream.mockResolvedValueOnce([{ contextRetriever: {} }, { prdAnalyzer: {} }, { emitComplete: {} }]);
    mockGetState.mockResolvedValueOnce({ values: makeState(), next: [] });

    const messages: string[] = [];
    await runScenario(SCENARIO, STUB_PROVIDER, undefined, (msg) => messages.push(msg));

    expect(messages.some((m) => m.includes('Starting pipeline'))).toBe(true);
    expect(messages.some((m) => m.includes('contextRetriever'))).toBe(true);
    expect(messages.some((m) => m.includes('prdAnalyzer'))).toBe(true);
  });
});
