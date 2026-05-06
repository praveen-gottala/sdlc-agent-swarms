import {
  EvalScenarioSchema,
  ClarifierMetricsSchema,
  RecordedCallSchema,
  RegressionResultSchema,
  EvalReportSchema,
} from './types.js';

describe('Zod schemas', () => {
  it('validates a well-formed EvalScenario', () => {
    const result = EvalScenarioSchema.safeParse({
      id: 'pomodoro',
      name: 'Pomodoro Timer',
      description: 'test',
      rawInput: 'Build a pomodoro app',
      mode: 'bootstrap',
      maxRounds: 3,
      expectedBehavior: {
        minQuestions: 1,
        maxQuestions: 15,
        expectEscalation: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates EvalScenario with maxAnswersPerRound', () => {
    const result = EvalScenarioSchema.safeParse({
      id: 'force-multi-round',
      name: 'Force Multi-Round',
      description: 'test',
      rawInput: 'Build something',
      mode: 'bootstrap',
      maxRounds: 3,
      maxAnswersPerRound: 2,
      expectedBehavior: {
        minQuestions: 1,
        maxQuestions: 45,
        expectEscalation: false,
        expectMultiRound: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxAnswersPerRound).toBe(2);
      expect(result.data.expectedBehavior.expectMultiRound).toBe(true);
    }
  });

  it('rejects EvalScenario with invalid mode', () => {
    const result = EvalScenarioSchema.safeParse({
      id: 'bad',
      name: 'Bad',
      description: 'test',
      rawInput: 'x',
      mode: 'invalid',
      maxRounds: 1,
      expectedBehavior: { minQuestions: 0, maxQuestions: 5, expectEscalation: false },
    });
    expect(result.success).toBe(false);
  });

  it('validates ClarifierMetrics with null PRD fields', () => {
    const result = ClarifierMetricsSchema.safeParse({
      scenarioId: 'escalation',
      threadId: 'eval-test-123',
      totalQuestions: 5,
      roundCount: 1,
      gapOverlapRatio: 0.0,
      prdDiffBytes: null,
      prdHashEqualAcrossRounds: null,
      totalCostUsd: 0.42,
      durationMs: 15000,
    });
    expect(result.success).toBe(true);
  });

  it('validates RecordedCall with cost field preserved', () => {
    const result = RecordedCallSchema.safeParse({
      seq: 0,
      promptHash: 'abc123',
      model: 'claude-sonnet-4-6',
      timestamp: '2026-05-02T10:00:00Z',
      result: {
        content: 'response text',
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 200 },
        cost: {
          inputCostUsd: 0.003,
          outputCostUsd: 0.0012,
          totalCostUsd: 0.0042,
          model: 'claude-sonnet-4-6',
          timestamp: '2026-05-02T10:00:00Z',
        },
        model: 'claude-sonnet-4-6',
        latencyMs: 1500,
        finishReason: 'stop',
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.result.cost.totalCostUsd).toBe(0.0042);
    }
  });

  it('validates RegressionResult', () => {
    const result = RegressionResultSchema.safeParse({
      metricName: 'total-cost-usd',
      direction: 'lower-is-better',
      baseline: 0.5,
      current: 0.7,
      regressed: true,
      deltaPct: 40,
    });
    expect(result.success).toBe(true);
  });

  it('validates EvalReport', () => {
    const result = EvalReportSchema.safeParse({
      timestamp: '2026-05-02T10:00:00Z',
      scenarios: [],
      totalCost: {
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        callCount: 0,
      },
      hasRegressions: false,
    });
    expect(result.success).toBe(true);
  });
});
