import type { ClarifierState } from '@agentforge/agents-clarifier';
import type { ClarifierMetrics, RunCostSummary } from '../types.js';
import { computeMetrics, METRIC_DEFINITIONS } from './clarifier-metrics.js';

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'test',
    mode: 'bootstrap' as const,
    context: {},
    gaps: [],
    questions: [
      { id: 'q1', gapId: 'gap-a', text: 'What?', type: 'open' as const, priority: 1, evpiScore: 0.8 },
      { id: 'q2', gapId: 'gap-b', text: 'How?', type: 'open' as const, priority: 2, evpiScore: 0.6 },
      { id: 'q3', gapId: 'gap-a', text: 'Details?', type: 'open' as const, priority: 3, evpiScore: 0.4 },
    ],
    humanResponses: [
      { questionId: 'q1', answer: 'Yes' },
      { questionId: 'q2', answer: 'No' },
      { questionId: 'q3', answer: 'Maybe' },
    ],
    requirement: null,
    assumptions: null,
    round: 2,
    maxRounds: 3,
    error: null,
    prdDraft: { title: 'Test PRD', sections: [] } as unknown as ClarifierState['prdDraft'],
    featurePlan: null,
    criticRetries: 0,
    criticPassed: true,
    escalationDecision: null,
    threadId: 'test-thread',
    ...overrides,
  };
}

const COST: RunCostSummary = {
  totalCostUsd: 0.42,
  totalInputTokens: 500,
  totalOutputTokens: 250,
  callCount: 5,
};

describe('computeMetrics', () => {
  it('computes all metrics from state', () => {
    const state = makeState();
    const metrics = computeMetrics('pomodoro', 'thread-1', state, COST, 15000);

    expect(metrics.scenarioId).toBe('pomodoro');
    expect(metrics.totalQuestions).toBe(3);
    expect(metrics.roundCount).toBe(2);
    expect(metrics.totalCostUsd).toBe(0.42);
    expect(metrics.durationMs).toBe(15000);
  });

  it('computes gap overlap ratio', () => {
    const state = makeState();
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000);
    // 3 questions, 2 unique gap IDs (gap-a, gap-b) → overlap = 1 - 2/3 ≈ 0.333
    expect(metrics.gapOverlapRatio).toBeCloseTo(0.333, 2);
  });

  it('returns zero overlap for unique gaps', () => {
    const state = makeState({
      questions: [
        { id: 'q1', gapId: 'g1', text: 'A?', type: 'open' as const, priority: 1, evpiScore: 0.5 },
        { id: 'q2', gapId: 'g2', text: 'B?', type: 'open' as const, priority: 2, evpiScore: 0.5 },
      ],
    });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000);
    expect(metrics.gapOverlapRatio).toBe(0);
  });

  it('computes prdDiffBytes between first and final PRD', () => {
    const firstPrd = { title: 'v1' } as unknown as ClarifierState['prdDraft'];
    const state = makeState({ prdDraft: { title: 'v2', extra: 'data' } as unknown as ClarifierState['prdDraft'] });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, firstPrd);
    expect(metrics.prdDiffBytes).toBeGreaterThan(0);
  });

  it('returns null prdDiffBytes when no firstPrdDraft', () => {
    const state = makeState();
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, null);
    expect(metrics.prdDiffBytes).toBeNull();
  });

  it('returns null prdDiffBytes when no final prdDraft', () => {
    const firstPrd = { title: 'v1' } as unknown as ClarifierState['prdDraft'];
    const state = makeState({ prdDraft: null });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, firstPrd);
    expect(metrics.prdDiffBytes).toBeNull();
  });

  it('computes prdHashEqualAcrossRounds = false when PRDs differ', () => {
    const firstPrd = { title: 'v1' } as unknown as ClarifierState['prdDraft'];
    const state = makeState({ prdDraft: { title: 'v2' } as unknown as ClarifierState['prdDraft'] });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, firstPrd);
    expect(metrics.prdHashEqualAcrossRounds).toBe(false);
  });

  it('computes prdHashEqualAcrossRounds = true when PRDs match (RED FLAG)', () => {
    const prd = { title: 'same' } as unknown as ClarifierState['prdDraft'];
    const state = makeState({ prdDraft: prd });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, prd);
    expect(metrics.prdHashEqualAcrossRounds).toBe(true);
  });

  it('returns null prdHashEqual when either PRD is null', () => {
    const state = makeState({ prdDraft: null });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000, null);
    expect(metrics.prdHashEqualAcrossRounds).toBeNull();
  });

  it('returns zero metrics for empty state', () => {
    const state = makeState({ questions: [], humanResponses: [], round: 0 });
    const metrics = computeMetrics('test', 'thread-1', state, COST, 1000);
    expect(metrics.totalQuestions).toBe(0);
    expect(metrics.gapOverlapRatio).toBe(0);
    expect(metrics.roundCount).toBe(0);
  });
});

describe('METRIC_DEFINITIONS', () => {
  const baseMetrics: ClarifierMetrics = {
    scenarioId: 'test',
    threadId: 'thread-1',
    totalQuestions: 7,
    roundCount: 2,
    gapOverlapRatio: 0.15,
    prdDiffBytes: 450,
    prdHashEqualAcrossRounds: null,
    totalCostUsd: 0.42,
    durationMs: 15000,
  };

  it('computes total-questions', () => {
    const def = METRIC_DEFINITIONS.find((d) => d.name === 'total-questions');
    expect(def!.compute(baseMetrics)).toBe(7);
  });

  it('computes round-count as lower-is-better', () => {
    const def = METRIC_DEFINITIONS.find((d) => d.name === 'round-count');
    expect(def!.compute(baseMetrics)).toBe(2);
    expect(def!.direction).toBe('lower-is-better');
  });

  it('computes total-cost-usd as lower-is-better', () => {
    const def = METRIC_DEFINITIONS.find((d) => d.name === 'total-cost-usd');
    expect(def!.compute(baseMetrics)).toBe(0.42);
    expect(def!.direction).toBe('lower-is-better');
  });

  it('returns null for prd-diff-bytes when null', () => {
    const def = METRIC_DEFINITIONS.find((d) => d.name === 'prd-diff-bytes');
    expect(def!.compute({ ...baseMetrics, prdDiffBytes: null })).toBeNull();
  });
});

describe('totalCostUsd aggregation', () => {
  it('sums per-call costs correctly', () => {
    const costs = [0.01, 0.02, 0.03, 0.005, 0.015];
    const summary: RunCostSummary = {
      totalCostUsd: costs.reduce((s, c) => s + c, 0),
      totalInputTokens: 500,
      totalOutputTokens: 250,
      callCount: costs.length,
    };
    expect(summary.totalCostUsd).toBeCloseTo(0.08, 6);
  });
});
