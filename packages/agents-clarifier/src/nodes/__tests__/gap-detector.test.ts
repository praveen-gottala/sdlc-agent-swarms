/**
 * Gap Detector node tests.
 * Scope: deterministic gap detection, ClarifyGPT LLM calls,
 * round>1 filtering, cost cap, deduplication.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState, Gap } from '../../types.js';
import type { PRD } from '@agentforge/core';
import {
  createGapDetector,
  runDeterministicChecklist,
  filterAddressedGaps,
  extractStructured,
  _resetPromptCache,
} from '../gap-detector.js';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('node:url', () => ({
  fileURLToPath: jest.fn(() => '/mock/src/nodes/gap-detector.ts'),
}));

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return { ...actual, debugLog: jest.fn() };
});

const { readFileSync } = jest.requireMock('node:fs') as { readFileSync: jest.Mock };

const MOCK_PROMPT = '---\nversion: 1.0.0\npurpose: Test\n---\nYou are an analyst.';

const BASE_PRD: PRD = {
  id: 'prd-001',
  title: 'Expense Tracker',
  description: 'A personal expense tracking application',
  features: [
    { id: 'feat-001', name: 'Add Expense', description: 'Record new expenses with form input' },
    { id: 'feat-002', name: 'Dashboard', description: 'Overview of user spending patterns' },
  ],
  personas: [
    { id: 'persona-001', name: 'User', role: 'consumer', goals: ['Track spending'] },
  ],
  dataEntities: [
    { id: 'entity-001', name: 'Expense', fields: [{ name: 'amount', type: 'number' }, { name: 'category', type: 'string' }] },
  ],
  screens: [
    { id: 'screen-001', name: 'Dashboard', description: 'Overview screen' },
    { id: 'screen-002', name: 'Add Expense', description: 'Form to add expense' },
  ],
  nfrs: [
    { id: 'nfr-001', category: 'performance', description: 'Page loads under 2s' },
  ],
  successMetrics: [
    { id: 'metric-001', name: 'DAU', description: 'Daily active users', target: '100', measurement: 'analytics' },
  ],
  outOfScope: ['Multi-currency'],
  version: '1.0.0',
  status: 'draft',
};

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Build expense tracker',
    mode: 'bootstrap',
    context: {},
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 0,
    maxRounds: 3,
    error: null,
    prdDraft: BASE_PRD,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    ...overrides,
  };
}

function makeMockDeps(): ClarifierDeps {
  return {
    provider: {
      name: 'mock',
      models: ['claude-sonnet-4-6'],
      complete: jest.fn(),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn(),
    } as unknown as ClarifierDeps['provider'],
    projectRoot: '/tmp/test',
    projectId: 'test-project',
  };
}

describe('runDeterministicChecklist', () => {
  it('detects missing auth when PRD has user data but no auth feature', () => {
    const gaps = runDeterministicChecklist(BASE_PRD);
    const authGap = gaps.find((g) => g.description.toLowerCase().includes('authentication'));
    expect(authGap).toBeDefined();
    expect(authGap!.category).toBe('missing');
    expect(authGap!.deterministic).toBe(true);
  });

  it('does not flag auth gap when PRD includes auth feature', () => {
    const prd: PRD = {
      ...BASE_PRD,
      features: [
        ...BASE_PRD.features,
        { id: 'feat-auth', name: 'Login', description: 'User authentication with password' },
      ],
    };
    const gaps = runDeterministicChecklist(prd);
    const authGap = gaps.find((g) => g.description.toLowerCase().includes('authentication'));
    expect(authGap).toBeUndefined();
  });

  it('detects missing validation rules when forms exist', () => {
    const gaps = runDeterministicChecklist(BASE_PRD);
    const validationGap = gaps.find((g) => g.description.toLowerCase().includes('validation'));
    expect(validationGap).toBeDefined();
    expect(validationGap!.category).toBe('missing');
  });

  it('detects missing error handling', () => {
    const gaps = runDeterministicChecklist(BASE_PRD);
    const errorGap = gaps.find((g) => g.description.toLowerCase().includes('error'));
    expect(errorGap).toBeDefined();
  });

  it('detects NFRs without measurable targets', () => {
    const gaps = runDeterministicChecklist(BASE_PRD);
    const nfrGap = gaps.find((g) => g.description.includes('NFR'));
    expect(nfrGap).toBeDefined();
    expect(nfrGap!.category).toBe('incomplete');
  });

  it('does not flag NFR targets when all have targets', () => {
    const prd: PRD = {
      ...BASE_PRD,
      nfrs: [{ id: 'nfr-001', category: 'performance', description: 'Fast loads', target: '<2s' }],
    };
    const gaps = runDeterministicChecklist(prd);
    const nfrGap = gaps.find((g) => g.description.includes('NFR'));
    expect(nfrGap).toBeUndefined();
  });

  it('detects missing accessibility requirements', () => {
    const gaps = runDeterministicChecklist(BASE_PRD);
    const a11yGap = gaps.find((g) => g.description.toLowerCase().includes('accessibility'));
    expect(a11yGap).toBeDefined();
  });
});

describe('filterAddressedGaps', () => {
  const gaps: Gap[] = [
    { id: 'gap-1', description: 'Auth missing', category: 'missing', confidence: 0.9, deterministic: true },
    { id: 'gap-2', description: 'No validation', category: 'missing', confidence: 0.7, deterministic: true },
  ];

  it('keeps gaps when no human responses exist', () => {
    const result = filterAddressedGaps(gaps, [], []);
    expect(result).toHaveLength(2);
  });

  it('removes gaps whose questions have been answered', () => {
    const questions = [
      { id: 'q-1', gapId: 'gap-1', text: 'Which auth?', type: 'open' as const, priority: 1, evpiScore: 0.9 },
    ];
    const responses = [{ questionId: 'q-1', answer: 'OAuth2' }];
    const result = filterAddressedGaps(gaps, questions, responses);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('gap-2');
  });

  it('keeps gaps whose questions were not answered', () => {
    const questions = [
      { id: 'q-1', gapId: 'gap-1', text: 'Which auth?', type: 'open' as const, priority: 1, evpiScore: 0.9 },
    ];
    const result = filterAddressedGaps(gaps, questions, []);
    expect(result).toHaveLength(2);
  });
});

describe('extractStructured', () => {
  it('returns structured when available', () => {
    const result = extractStructured<{ x: number }>({ structured: { x: 42 }, content: '' });
    expect(result).toEqual({ x: 42 });
  });

  it('falls back to parsing content when structured is undefined', () => {
    const result = extractStructured<{ x: number }>({ structured: undefined, content: '{"x": 42}' });
    expect(result).toEqual({ x: 42 });
  });

  it('handles code-fenced JSON', () => {
    const result = extractStructured<{ x: number }>({ structured: undefined, content: '```json\n{"x": 42}\n```' });
    expect(result).toEqual({ x: 42 });
  });

  it('returns null on invalid JSON', () => {
    const result = extractStructured<unknown>({ structured: undefined, content: 'not json' });
    expect(result).toBeNull();
  });
});

describe('createGapDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPromptCache();
    readFileSync.mockReturnValue(MOCK_PROMPT);
  });

  it('returns error when prdDraft is null', async () => {
    const deps = makeMockDeps();
    const node = createGapDetector(deps);
    const result = await node(makeState({ prdDraft: null }));

    expect(result.error).toContain('no PRD draft');
    expect(result.round).toBe(1);
  });

  it('returns deterministic gaps even when LLM fails', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 5000 },
    });

    const node = createGapDetector(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.gaps).toBeDefined();
    expect(result.gaps!.length).toBeGreaterThan(0);
    expect(result.gaps!.every((g) => g.deterministic)).toBe(true);
    expect(result.round).toBe(1);
  });

  it('merges deterministic and LLM gaps when both succeed', async () => {
    const deps = makeMockDeps();
    const completeMock = deps.provider.complete as jest.Mock;

    completeMock.mockResolvedValueOnce({
      ok: true,
      value: {
        content: '',
        structured: {
          implementations: [
            { approach: 'Approach A', keyDecisions: ['Decision 1'] },
            { approach: 'Approach B', keyDecisions: ['Decision 2'] },
            { approach: 'Approach C', keyDecisions: ['Decision 3'] },
          ],
        },
        toolCalls: [],
        usage: { inputTokens: 300, outputTokens: 600 },
        cost: { inputCostUsd: 0.001, outputCostUsd: 0.002, totalCostUsd: 0.003, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
        model: 'claude-sonnet-4-6',
        latencyMs: 2000,
        finishReason: 'stop',
      },
    });

    completeMock.mockResolvedValueOnce({
      ok: true,
      value: {
        content: '',
        structured: {
          gaps: [
            {
              description: 'Data export format not specified',
              category: 'missing',
              interpretations: ['CSV export', 'JSON export', 'PDF report'],
            },
          ],
        },
        toolCalls: [],
        usage: { inputTokens: 400, outputTokens: 300 },
        cost: { inputCostUsd: 0.001, outputCostUsd: 0.001, totalCostUsd: 0.002, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
        model: 'claude-sonnet-4-6',
        latencyMs: 1500,
        finishReason: 'stop',
      },
    });

    const node = createGapDetector(deps);
    const result = await node(makeState());

    expect(result.gaps).toBeDefined();
    const detGaps = result.gaps!.filter((g) => g.deterministic);
    const llmGaps = result.gaps!.filter((g) => !g.deterministic);
    expect(detGaps.length).toBeGreaterThan(0);
    expect(llmGaps.length).toBe(1);
    expect(llmGaps[0].description).toBe('Data export format not specified');
    expect(llmGaps[0].divergentInterpretations).toEqual(['CSV export', 'JSON export', 'PDF report']);
  });

  it('deduplicates LLM gaps that match deterministic gaps', async () => {
    const deps = makeMockDeps();
    const completeMock = deps.provider.complete as jest.Mock;

    completeMock.mockResolvedValueOnce({
      ok: true,
      value: {
        content: '',
        structured: {
          implementations: [
            { approach: 'A', keyDecisions: ['d1'] },
            { approach: 'B', keyDecisions: ['d2'] },
            { approach: 'C', keyDecisions: ['d3'] },
          ],
        },
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 200 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
        model: 'claude-sonnet-4-6',
        latencyMs: 500,
        finishReason: 'stop',
      },
    });

    completeMock.mockResolvedValueOnce({
      ok: true,
      value: {
        content: '',
        structured: {
          gaps: [
            {
              description: 'PRD references user data but does not specify an authentication strategy.',
              category: 'missing',
              interpretations: ['OAuth', 'JWT'],
            },
          ],
        },
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 100 },
        cost: { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
        model: 'claude-sonnet-4-6',
        latencyMs: 500,
        finishReason: 'stop',
      },
    });

    const node = createGapDetector(deps);
    const result = await node(makeState());

    const authGaps = result.gaps!.filter((g) =>
      g.description.toLowerCase().includes('authentication'),
    );
    expect(authGaps).toHaveLength(1);
    expect(authGaps[0].deterministic).toBe(true);
  });

  it('passes claude-sonnet-4-6 and correct schemas to provider', async () => {
    const deps = makeMockDeps();
    const completeMock = deps.provider.complete as jest.Mock;
    completeMock.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 1000 },
    });

    const node = createGapDetector(deps);
    await node(makeState());

    const [, options] = completeMock.mock.calls[0];
    expect(options.model).toBe('claude-sonnet-4-6');
    expect(options.temperature).toBe(0.7);
    expect(options.responseSchema).toBeDefined();
  });

  it('increments round on every call', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 1000 },
    });

    const node = createGapDetector(deps);
    const r1 = await node(makeState({ round: 0 }));
    expect(r1.round).toBe(1);

    const r2 = await node(makeState({ round: 2 }));
    expect(r2.round).toBe(3);
  });

  it('filters addressed gaps in round > 0', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 1000 },
    });

    const existingGaps: Gap[] = [
      { id: 'det-missing-0', description: 'Auth missing', category: 'missing', confidence: 0.9, deterministic: true },
    ];

    const node = createGapDetector(deps);
    const result = await node(
      makeState({
        round: 1,
        gaps: existingGaps,
        questions: [{ id: 'q-1', gapId: 'det-missing-0', text: 'Auth?', type: 'open', priority: 1, evpiScore: 0.9 }],
        humanResponses: [{ questionId: 'q-1', answer: 'Use OAuth2' }],
      }),
    );

    const authGaps = result.gaps!.filter((g) =>
      g.description.toLowerCase().includes('authentication'),
    );
    expect(authGaps).toHaveLength(0);
  });
});
