/**
 * Story Writer node tests.
 * Scope: EARS criteria generation, FeaturePlan assembly, EnrichedRequirement
 * wrapping, max-round low confidence, assumption finalization, user message
 * construction, mode branching.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState } from '../../types.js';
import type { PRD } from '@agentforge/core';
import {
  createStoryWriter,
  buildUserMessage,
  assembleFeaturePlan,
  finalizeAssumptions,
  _resetPromptCache,
} from '../story-writer.js';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('node:url', () => ({
  fileURLToPath: jest.fn(() => '/mock/src/nodes/story-writer.ts'),
}));

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return { ...actual, debugLog: jest.fn() };
});

const { readFileSync } = jest.requireMock('node:fs') as { readFileSync: jest.Mock };

const MOCK_PROMPT = '---\nversion: 1.0.0\npurpose: Test\n---\nYou are a requirements engineer.';

const TEST_PRD: PRD = {
  id: 'prd-001',
  title: 'Expense Tracker',
  description: 'Track expenses',
  features: [
    { id: 'feat-001', name: 'Add Expense', description: 'Record expenses', priority: 'must-have' },
    { id: 'feat-002', name: 'Dashboard', description: 'Overview', priority: 'should-have' },
  ],
  personas: [{ id: 'p1', name: 'User', role: 'consumer', goals: ['track spending'] }],
  dataEntities: [{ id: 'e1', name: 'Expense', fields: [{ name: 'amount', type: 'number' }] }],
  screens: [
    { id: 's1', name: 'Dashboard', description: 'Main screen' },
    { id: 's2', name: 'Add Expense', description: 'Form' },
  ],
  nfrs: [{ id: 'nfr-1', category: 'performance', description: 'Fast' }],
  successMetrics: [{ id: 'm1', name: 'DAU', description: 'Users', target: '100', measurement: 'analytics' }],
  outOfScope: [],
  version: '1.0.0',
  status: 'draft',
};

const VALID_RESPONSE = {
  features: [
    {
      featureId: 'feat-001',
      acceptanceCriteria: [
        { condition: 'user submits the expense form', behavior: 'save the expense and show confirmation' },
        { condition: 'user leaves amount blank', behavior: 'show validation error' },
      ],
      dependencies: [],
    },
    {
      featureId: 'feat-002',
      acceptanceCriteria: [
        { condition: 'user navigates to dashboard', behavior: 'display monthly spending total' },
      ],
      dependencies: ['feat-001'],
    },
  ],
  confidence: 0.85,
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
    round: 1,
    maxRounds: 3,
    error: null,
    prdDraft: TEST_PRD,
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

function makeCompletionResult(response: unknown) {
  return {
    ok: true as const,
    value: {
      content: JSON.stringify(response),
      structured: response as Record<string, unknown>,
      toolCalls: [],
      usage: { inputTokens: 500, outputTokens: 1000 },
      cost: { inputCostUsd: 0.002, outputCostUsd: 0.003, totalCostUsd: 0.005, model: 'claude-sonnet-4-6', timestamp: new Date().toISOString() },
      model: 'claude-sonnet-4-6',
      latencyMs: 2500,
      finishReason: 'stop' as const,
    },
  };
}

describe('createStoryWriter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPromptCache();
    readFileSync.mockReturnValue(MOCK_PROMPT);
  });

  it('produces FeaturePlan with EARS criteria from valid response', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_RESPONSE));

    const node = createStoryWriter(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.featurePlan).toBeDefined();
    expect(result.featurePlan!.features).toHaveLength(2);

    const feat1 = result.featurePlan!.features[0];
    expect(feat1.id).toBe('feat-001');
    expect(feat1.name).toBe('Add Expense');
    expect(feat1.acceptanceCriteria).toHaveLength(2);
    expect(feat1.acceptanceCriteria[0].formatted).toContain('WHEN');
    expect(feat1.acceptanceCriteria[0].formatted).toContain('THE SYSTEM SHALL');
  });

  it('produces EnrichedRequirement wrapping prdDraft', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_RESPONSE));

    const node = createStoryWriter(deps);
    const result = await node(makeState());

    expect(result.requirement).toBeDefined();
    expect(result.requirement!.prd.title).toBe('Expense Tracker');
    expect(result.requirement!.mode).toBe('bootstrap');
    expect(result.requirement!.rawInput).toBe('Build expense tracker');
    expect(result.requirement!.confidence).toBe(0.85);
  });

  it('caps confidence at 0.5 when max rounds reached', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_RESPONSE));

    const node = createStoryWriter(deps);
    const result = await node(makeState({ round: 3, maxRounds: 3 }));

    expect(result.requirement!.confidence).toBeLessThanOrEqual(0.5);
  });

  it('records feature dependencies in FeaturePlan', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_RESPONSE));

    const node = createStoryWriter(deps);
    const result = await node(makeState());

    const dashboard = result.featurePlan!.features.find((f) => f.id === 'feat-002');
    expect(dashboard!.dependencies).toEqual(['feat-001']);
  });

  it('returns error when prdDraft is null', async () => {
    const deps = makeMockDeps();
    const node = createStoryWriter(deps);
    const result = await node(makeState({ prdDraft: null }));

    expect(result.error).toContain('no PRD draft');
  });

  it('returns error when LLM call fails', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 5000 },
    });

    const node = createStoryWriter(deps);
    const result = await node(makeState());

    expect(result.error).toContain('RATE_LIMITED');
  });

  it('passes claude-sonnet-4-6 model and promptVersion to provider', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_RESPONSE));

    const node = createStoryWriter(deps);
    await node(makeState());

    const [, options] = (deps.provider.complete as jest.Mock).mock.calls[0];
    expect(options.model).toBe('claude-sonnet-4-6');
    expect(options.promptVersion).toBe('1.0.0');
  });
});

describe('buildUserMessage', () => {
  it('includes mode, PRD features, and screens', () => {
    const msg = buildUserMessage(makeState());
    expect(msg).toContain('## Mode: bootstrap');
    expect(msg).toContain('Add Expense');
    expect(msg).toContain('feat-001');
    expect(msg).toContain('Dashboard');
  });

  it('includes human clarifications when present', () => {
    const msg = buildUserMessage(
      makeState({
        questions: [{ id: 'q-1', gapId: 'g-1', text: 'Which auth?', type: 'open', priority: 1, evpiScore: 0.9 }],
        humanResponses: [{ questionId: 'q-1', answer: 'Use OAuth2' }],
      }),
    );
    expect(msg).toContain('## Human Clarifications');
    expect(msg).toContain('Which auth?');
    expect(msg).toContain('Use OAuth2');
  });

  it('shows unresolved gaps', () => {
    const msg = buildUserMessage(
      makeState({
        gaps: [{ id: 'g-1', description: 'No error handling', category: 'missing', confidence: 0.5, deterministic: true }],
      }),
    );
    expect(msg).toContain('## Unresolved Gaps');
    expect(msg).toContain('No error handling');
  });
});

describe('assembleFeaturePlan', () => {
  it('maps LLM response to FeatureNode with EARS criteria', () => {
    const plan = assembleFeaturePlan(VALID_RESPONSE, makeState());

    expect(plan.features).toHaveLength(2);
    const feat1 = plan.features[0];
    expect(feat1.id).toBe('feat-001');
    expect(feat1.name).toBe('Add Expense');
    expect(feat1.status).toBe('planned');
    expect(feat1.acceptanceCriteria[0].formatted).toBe(
      'WHEN user submits the expense form THE SYSTEM SHALL save the expense and show confirmation',
    );
  });

  it('assigns unique criterion IDs', () => {
    const plan = assembleFeaturePlan(VALID_RESPONSE, makeState());
    const allIds = plan.features.flatMap((f) => f.acceptanceCriteria.map((c) => c.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe('finalizeAssumptions', () => {
  it('adds unresolved gaps as assumptions when max rounds reached', () => {
    const state = makeState({
      round: 3,
      maxRounds: 3,
      gaps: [{ id: 'g-1', description: 'Auth missing', category: 'missing', confidence: 0.2, deterministic: true }],
      questions: [{ id: 'q-1', gapId: 'g-1', text: 'Auth?', type: 'open', priority: 1, evpiScore: 0.9 }],
      humanResponses: [],
    });
    const result = finalizeAssumptions(state, true);

    expect(result.entries.length).toBeGreaterThan(0);
    const authAssumption = result.entries.find((e) => e.id.includes('g-1'));
    expect(authAssumption).toBeDefined();
    expect(authAssumption!.requiresConfirmation).toBe(true);
    expect(authAssumption!.blastRadius).toBe('high');
  });

  it('does not add assumptions for answered gaps', () => {
    const state = makeState({
      round: 3,
      maxRounds: 3,
      gaps: [{ id: 'g-1', description: 'Auth missing', category: 'missing', confidence: 0.2, deterministic: true }],
      questions: [{ id: 'q-1', gapId: 'g-1', text: 'Auth?', type: 'open', priority: 1, evpiScore: 0.9 }],
      humanResponses: [{ questionId: 'q-1', answer: 'OAuth2' }],
    });
    const result = finalizeAssumptions(state, true);

    expect(result.entries.find((e) => e.id.includes('g-1'))).toBeUndefined();
  });

  it('preserves existing assumption entries', () => {
    const state = makeState({
      assumptions: {
        id: 'ledger-1',
        entries: [{ id: 'old-1', statement: 'Old', evidence: 'test', confidence: 0.5, blastRadius: 'low', requiresConfirmation: false }],
        createdAt: '2026-01-01',
        lastUpdatedAt: '2026-01-01',
      },
    });
    const result = finalizeAssumptions(state, false);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('old-1');
  });
});
