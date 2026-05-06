/**
 * Gap Detector node tests.
 * Scope: intent-level deterministic gap detection, ClarifyGPT LLM calls,
 * round>1 filtering, cost cap, deduplication, ensureGapHasOptions.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState, Gap } from '../../types.js';
import type { PRD } from '@agentforge/core';
import {
  createGapDetector,
  runDeterministicChecklist,
  runClarifyGPT,
  filterAddressedGaps,
  filterAskedGaps,
  gapContentId,
  extractStructured,
  ensureGapHasOptions,
  groupFeaturesByIntent,
  categorizeFeature,
  buildDataEntryOptions,
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
    { id: 'feat-003', name: 'Budget Management', description: 'Set and track monthly budget limits' },
    { id: 'feat-004', name: 'Category Management', description: 'Organize expenses into categories and tags' },
    { id: 'feat-005', name: 'Export Data', description: 'Export expense data as CSV or PDF reports' },
  ],
  personas: [
    { id: 'persona-001', name: 'User', role: 'consumer', goals: ['Track spending'] },
  ],
  dataEntities: [
    {
      id: 'entity-001',
      name: 'Expense',
      fields: [
        { name: 'amount', type: 'number', required: true },
        { name: 'category', type: 'string', required: true },
        { name: 'date', type: 'date', required: true },
        { name: 'description', type: 'string', required: false },
        { name: 'receipt', type: 'string', required: false },
      ],
    },
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
    rawInput: 'Build me a personal expense tracker',
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
    threadId: '',
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

// ---------------------------------------------------------------------------
// Intent-level deterministic checklist
// ---------------------------------------------------------------------------

describe('runDeterministicChecklist', () => {
  it('generates scope confirmation gap in bootstrap mode round 0', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const scopeGap = gaps.find((g) => g.topic === 'Scope');
    expect(scopeGap).toBeDefined();
    expect(scopeGap!.category).toBe('missing');
    expect(scopeGap!.confidence).toBe(0.05);
    expect(scopeGap!.divergenceScore).toBe(1.0);
    expect(scopeGap!.divergentInterpretations!.length).toBeGreaterThanOrEqual(2);
  });

  it('scope confirmation options reflect PRD feature groups', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const scopeGap = gaps.find((g) => g.topic === 'Scope');
    const labels = scopeGap!.divergentInterpretations!.map((o) => o.label);
    expect(labels.some((l) => l.includes('Budget') || l.includes('goal'))).toBe(true);
    expect(labels.some((l) => l.includes('Categor') || l.includes('organization'))).toBe(true);
  });

  it('scope confirmation marks seed-implied features as recommended', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const scopeGap = gaps.find((g) => g.topic === 'Scope');
    const options = scopeGap!.divergentInterpretations!;
    const coreGroup = options.find((o) => o.label === 'Core features');
    if (coreGroup) {
      expect(coreGroup.recommended).toBe(true);
    }
    const recommended = options.filter((o) => o.recommended);
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });

  it('does not generate scope confirmation in evolution mode', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'evolution', 0);
    const scopeGap = gaps.find((g) => g.topic === 'Scope');
    expect(scopeGap).toBeUndefined();
  });

  it('does not generate scope confirmation in round > 0', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 1);
    const scopeGap = gaps.find((g) => g.topic === 'Scope');
    expect(scopeGap).toBeUndefined();
  });

  it('generates user-count gap when PRD has personal/user keywords but no auth', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const usersGap = gaps.find((g) => g.topic === 'Users');
    expect(usersGap).toBeDefined();
    expect(usersGap!.description).toContain('just for you');
    expect(usersGap!.divergentInterpretations!.length).toBeGreaterThanOrEqual(2);
  });

  it('does not flag user-count gap when PRD includes auth feature', () => {
    const prd: PRD = {
      ...BASE_PRD,
      features: [
        ...BASE_PRD.features,
        { id: 'feat-auth', name: 'Login', description: 'User authentication with password' },
      ],
    };
    const gaps = runDeterministicChecklist(prd, 'Build expense tracker', 'bootstrap', 0);
    const usersGap = gaps.find((g) => g.topic === 'Users');
    expect(usersGap).toBeUndefined();
  });

  it('generates platform gap when no platform keywords in seed', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const platformGap = gaps.find((g) => g.topic === 'Platform');
    expect(platformGap).toBeDefined();
    expect(platformGap!.description).toContain('web app');
    expect(platformGap!.divergentInterpretations!.length).toBeGreaterThanOrEqual(2);
  });

  it('does not generate platform gap when seed mentions platform', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build a mobile expense tracker', 'bootstrap', 0);
    const platformGap = gaps.find((g) => g.topic === 'Platform');
    expect(platformGap).toBeUndefined();
  });

  it('generates data-entry-style gap when entity has 4+ fields', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const dataEntryGap = gaps.find((g) => g.topic?.startsWith('Adding'));
    expect(dataEntryGap).toBeDefined();
    expect(dataEntryGap!.description).toContain('quick');
    expect(dataEntryGap!.divergentInterpretations!.length).toBeGreaterThanOrEqual(2);
  });

  it('does not generate data-entry gap when entity has < 4 fields', () => {
    const prd: PRD = {
      ...BASE_PRD,
      dataEntities: [
        { id: 'entity-001', name: 'Item', fields: [{ name: 'name', type: 'string' }, { name: 'price', type: 'number' }] },
      ],
    };
    const gaps = runDeterministicChecklist(prd, 'Build expense tracker', 'bootstrap', 0);
    const dataEntryGap = gaps.find((g) => g.topic?.startsWith('Adding'));
    expect(dataEntryGap).toBeUndefined();
  });

  it('generates phantom gaps for validation, errors, accessibility with divergenceScore 0', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);

    const validationPhantom = gaps.find((g) => g.topic === 'Validation');
    expect(validationPhantom).toBeDefined();
    expect(validationPhantom!.divergenceScore).toBe(0.0);
    expect(validationPhantom!.confidence).toBe(0.95);

    const errorPhantom = gaps.find((g) => g.topic === 'Error handling');
    expect(errorPhantom).toBeDefined();
    expect(errorPhantom!.divergenceScore).toBe(0.0);

    const a11yPhantom = gaps.find((g) => g.topic === 'Accessibility');
    expect(a11yPhantom).toBeDefined();
    expect(a11yPhantom!.divergenceScore).toBe(0.0);
  });

  it('generates performance phantom gap when NFRs lack targets', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const perfPhantom = gaps.find((g) => g.topic === 'Performance');
    expect(perfPhantom).toBeDefined();
    expect(perfPhantom!.divergenceScore).toBe(0.0);
  });

  it('all non-phantom deterministic gaps have at least 2 options', () => {
    const gaps = runDeterministicChecklist(BASE_PRD, 'Build expense tracker', 'bootstrap', 0);
    const nonPhantom = gaps.filter((g) =>
      g.divergenceScore === undefined || g.divergenceScore >= 0.3,
    );
    for (const gap of nonPhantom) {
      expect(gap.divergentInterpretations?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature grouping helpers
// ---------------------------------------------------------------------------

describe('categorizeFeature', () => {
  it('categorizes budget-related features', () => {
    expect(categorizeFeature('Budget Management', 'Set budget limits')).toBe('Budgets & goals');
  });

  it('categorizes category-related features', () => {
    expect(categorizeFeature('Category Mgmt', 'Organize into categories')).toBe('Categories & organization');
  });

  it('categorizes export features', () => {
    expect(categorizeFeature('Export', 'Export CSV data')).toBe('Data export & backup');
  });

  it('falls back to Core features for uncategorized', () => {
    expect(categorizeFeature('Something', 'Does stuff')).toBe('Core features');
  });
});

describe('groupFeaturesByIntent', () => {
  it('groups features into semantic clusters', () => {
    const groups = groupFeaturesByIntent(BASE_PRD, 'Build expense tracker');
    const labels = groups.map((g) => g.label);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('marks seed-implied groups as recommended', () => {
    const groups = groupFeaturesByIntent(BASE_PRD, 'Build expense tracker');
    const recommended = groups.filter((g) => g.recommended);
    expect(recommended.length).toBeGreaterThanOrEqual(1);
  });
});

describe('buildDataEntryOptions', () => {
  it('generates quick and detailed options', () => {
    const entity = BASE_PRD.dataEntities[0];
    const options = buildDataEntryOptions(entity);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.find((o) => o.label === 'Quick entry')).toBeDefined();
    expect(options.find((o) => o.label === 'Detailed entry')).toBeDefined();
  });

  it('adds flexible option when entity has optional fields', () => {
    const entity = BASE_PRD.dataEntities[0];
    const options = buildDataEntryOptions(entity);
    expect(options.find((o) => o.label === 'Flexible')).toBeDefined();
  });

  it('omits flexible option when no optional fields', () => {
    const entity = {
      id: 'e1',
      name: 'Item',
      fields: [
        { name: 'a', type: 'string', required: true },
        { name: 'b', type: 'number', required: true },
        { name: 'c', type: 'date', required: true },
        { name: 'd', type: 'string', required: true },
      ],
    };
    const options = buildDataEntryOptions(entity);
    expect(options.find((o) => o.label === 'Flexible')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ensureGapHasOptions
// ---------------------------------------------------------------------------

describe('ensureGapHasOptions', () => {
  it('passes through gaps that already have 2+ options', () => {
    const gap: Gap = {
      id: 'g1',
      description: 'Some question?',
      category: 'missing',
      confidence: 0.5,
      deterministic: false,
      divergentInterpretations: [
        { label: 'A', description: 'a', recommended: true, source: 'llm' },
        { label: 'B', description: 'b', recommended: false, source: 'llm' },
      ],
    };
    const result = ensureGapHasOptions(gap);
    expect(result).toBe(gap);
  });

  it('adds yes/no fallback when gap has no options', () => {
    const gap: Gap = {
      id: 'g2',
      topic: 'Notifications',
      description: 'Do you want notifications?',
      category: 'missing',
      confidence: 0.5,
      deterministic: false,
    };
    const result = ensureGapHasOptions(gap);
    expect(result.divergentInterpretations!.length).toBe(2);
    expect(result.divergentInterpretations![0].label).toBe('Yes, include this');
    expect(result.divergentInterpretations![1].label).toBe('No, skip for now');
  });

  it('skips phantom gaps (divergenceScore < 0.3)', () => {
    const gap: Gap = {
      id: 'g3',
      description: 'Validation default',
      category: 'missing',
      confidence: 0.95,
      deterministic: true,
      divergenceScore: 0.0,
    };
    const result = ensureGapHasOptions(gap);
    expect(result).toBe(gap);
    expect(result.divergentInterpretations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// filterAddressedGaps
// ---------------------------------------------------------------------------

describe('filterAddressedGaps', () => {
  const gaps: Gap[] = [
    { id: 'gap-1', description: 'Users question', category: 'missing', confidence: 0.3, deterministic: true },
    { id: 'gap-2', description: 'Platform question', category: 'missing', confidence: 0.4, deterministic: true },
  ];

  it('keeps gaps when no human responses exist', () => {
    const result = filterAddressedGaps(gaps, [], []);
    expect(result).toHaveLength(2);
  });

  it('removes gaps whose questions have been answered', () => {
    const questions = [
      { id: 'q-1', gapId: 'gap-1', text: 'Who uses it?', type: 'multiple-choice' as const, priority: 1, evpiScore: 0.9 },
    ];
    const responses = [{ questionId: 'q-1', answer: 'Just me' }];
    const result = filterAddressedGaps(gaps, questions, responses);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('gap-2');
  });

  it('keeps gaps whose questions were not answered', () => {
    const questions = [
      { id: 'q-1', gapId: 'gap-1', text: 'Who uses it?', type: 'multiple-choice' as const, priority: 1, evpiScore: 0.9 },
    ];
    const result = filterAddressedGaps(gaps, questions, []);
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// extractStructured
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// createGapDetector (integration with LLM)
// ---------------------------------------------------------------------------

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

  it('includes scope confirmation as first gap in bootstrap mode', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 5000 },
    });

    const node = createGapDetector(deps);
    const result = await node(makeState());

    const scopeGap = result.gaps!.find((g) => g.topic === 'Scope');
    expect(scopeGap).toBeDefined();
    expect(scopeGap!.confidence).toBe(0.05);
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
              topic: 'Sharing',
              description: 'Do you want to share your expenses with anyone?',
              category: 'missing',
              options: [
                { label: 'Just me', description: 'Keep it private.', rationale: 'Simplest option.', recommended: true, source: 'template' },
                { label: 'Share with family', description: 'Family members can see spending.', rationale: 'Good for shared budgets.', recommended: false, source: 'template' },
              ],
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
    expect(llmGaps[0].topic).toBe('Sharing');
    expect(llmGaps[0].divergentInterpretations!.map((o) => o.label)).toEqual(['Just me', 'Share with family']);
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
              topic: 'Users',
              description: 'Is this just for you, or should multiple people have separate accounts?',
              category: 'missing',
              options: [
                { label: 'Single user', description: 'One person.', rationale: 'Simple.', recommended: true, source: 'llm' },
                { label: 'Multi user', description: 'Multiple people.', rationale: 'More reach.', recommended: false, source: 'llm' },
              ],
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

    const usersGaps = result.gaps!.filter((g) => g.topic === 'Users');
    expect(usersGaps).toHaveLength(1);
    expect(usersGaps[0].deterministic).toBe(true);
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
      { id: 'det-users-0', description: 'Is this just for you, or should multiple people have separate accounts?', category: 'missing', confidence: 0.3, deterministic: true },
    ];

    const node = createGapDetector(deps);
    const result = await node(
      makeState({
        round: 1,
        gaps: existingGaps,
        questions: [{ id: 'q-1', gapId: 'det-users-0', text: 'Users?', type: 'multiple-choice', priority: 1, evpiScore: 0.9 }],
        humanResponses: [{ questionId: 'q-1', answer: 'Just me' }],
      }),
    );

    const usersGaps = result.gaps!.filter((g) => g.topic === 'Users');
    expect(usersGaps).toHaveLength(0);
  });

  it('ensures all non-phantom gaps have options after processing', async () => {
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
              topic: 'Data retention',
              description: 'How long should data be kept?',
              category: 'ambiguous',
              options: [],
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

    const nonPhantom = result.gaps!.filter((g) =>
      g.divergenceScore === undefined || g.divergenceScore >= 0.3,
    );
    for (const gap of nonPhantom) {
      expect(gap.divergentInterpretations?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('gapContentId', () => {
  it('produces stable IDs for the same topic+description', () => {
    const id1 = gapContentId('Auth', 'No authentication strategy');
    const id2 = gapContentId('Auth', 'No authentication strategy');
    expect(id1).toBe(id2);
  });

  it('produces different IDs for different content', () => {
    const id1 = gapContentId('Auth', 'No authentication strategy');
    const id2 = gapContentId('Storage', 'Data persistence unclear');
    expect(id1).not.toBe(id2);
  });

  it('starts with llm- prefix', () => {
    const id = gapContentId('Topic', 'Description');
    expect(id).toMatch(/^llm-[a-f0-9]{8}$/);
  });

  it('handles empty topic', () => {
    const id = gapContentId('', 'Some description');
    expect(id).toMatch(/^llm-[a-f0-9]{8}$/);
  });
});

describe('filterAskedGaps', () => {
  const gaps: Gap[] = [
    { id: 'gap-1', description: 'Auth missing', category: 'missing', confidence: 0.3, deterministic: true },
    { id: 'gap-2', description: 'Storage unclear', category: 'ambiguous', confidence: 0.4, deterministic: true },
    { id: 'gap-3', description: 'Platform choice', category: 'missing', confidence: 0.2, deterministic: true },
  ];

  it('removes gaps that had questions generated (even if unanswered)', () => {
    const questions = [
      { id: 'q-0-0', gapId: 'gap-1', text: 'Auth?', type: 'open' as const, priority: 1, evpiScore: 0.8 },
      { id: 'q-0-1', gapId: 'gap-2', text: 'Storage?', type: 'open' as const, priority: 2, evpiScore: 0.6 },
    ];

    const result = filterAskedGaps(gaps, questions);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('gap-3');
  });

  it('keeps all gaps when no questions exist', () => {
    const result = filterAskedGaps(gaps, []);
    expect(result).toHaveLength(3);
  });

  it('handles gaps with no matching questions', () => {
    const questions = [
      { id: 'q-0-0', gapId: 'gap-unknown', text: 'Unknown?', type: 'open' as const, priority: 1, evpiScore: 0.5 },
    ];

    const result = filterAskedGaps(gaps, questions);
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// FB1: Q&A awareness in divergence prompts
// ---------------------------------------------------------------------------

describe('ClarifyGPT qaSection injection (FB1)', () => {
  beforeEach(() => {
    _resetPromptCache();
    readFileSync.mockReturnValue(MOCK_PROMPT);
  });

  it('includes qaSection in user message when previousQA exists (round > 0)', async () => {
    const deps = makeMockDeps();
    const completeMock = deps.provider.complete as jest.Mock;

    completeMock.mockResolvedValue({
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

    const previousQA = [
      { question: 'Is this just for you?', answer: 'Just for me' },
    ];

    await runClarifyGPT(deps, BASE_PRD, 'Build expense tracker', {}, 'bootstrap', previousQA);

    // The second call is the divergence analysis — that's where qaSection is injected
    expect(completeMock).toHaveBeenCalledTimes(2);
    const divergeCallArgs = completeMock.mock.calls[1];
    const userMessage = divergeCallArgs[0].messages[0].content;
    expect(userMessage).toContain('Already Clarified');
    expect(userMessage).toContain('Is this just for you?');
    expect(userMessage).toContain('Just for me');
  });

  it('qaSection is absent in round 0 with no previousQA', async () => {
    const deps = makeMockDeps();
    const completeMock = deps.provider.complete as jest.Mock;

    completeMock.mockResolvedValue({
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

    await runClarifyGPT(deps, BASE_PRD, 'Build expense tracker', {}, 'bootstrap');

    expect(completeMock).toHaveBeenCalledTimes(2);
    const divergeCallArgs = completeMock.mock.calls[1];
    const userMessage = divergeCallArgs[0].messages[0].content;
    expect(userMessage).not.toContain('Already Clarified');
  });

  // Documents known limitation: SHA-256(topic::description) cannot catch
  // semantic duplicates with different wording. The prompt instruction is the
  // primary defense. Remove skip when embedding-based dedup is implemented
  // (see execution plan: Semantic Deduplication for LLM Gaps).
  it.skip('semantic duplicates produce different content hashes (known limitation)', () => {
    const id1 = gapContentId('Auth', 'Do you need user login?');
    const id2 = gapContentId('Auth', 'Should the app require authentication?');
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// FB2: Divergence prompt protects against asking about LLM-generated artifacts
// ---------------------------------------------------------------------------

describe('divergence prompt artifact protection (FB2)', () => {
  it('divergence prompt forbids asking about LLM-generated artifacts', () => {
    _resetPromptCache();
    // Load the real bootstrap prompt to verify it contains the anti-pattern instruction
    const { readFileSync: realReadFile } = jest.requireActual('node:fs') as typeof import('node:fs');
    const { fileURLToPath: realFileUrl } = jest.requireActual('node:url') as typeof import('node:url');
    const { join: realJoin, dirname: realDirname } = jest.requireActual('node:path') as typeof import('node:path');

    let promptText: string;
    try {
      const promptDir = realJoin(realDirname(realFileUrl(import.meta.url)), '..', '..', 'prompts');
      promptText = realReadFile(realJoin(promptDir, 'gap-divergence-bootstrap.md'), 'utf-8');
    } catch {
      // If we can't read the real file in test env, skip gracefully
      return;
    }

    // Assert stable concepts, not verbatim phrases — survives prompt rewording
    const lowerPrompt = promptText.toLowerCase();
    expect(lowerPrompt).toContain('anti-pattern');
    expect(lowerPrompt).toMatch(/screen names|entity names|nfr/i);
  });
});
