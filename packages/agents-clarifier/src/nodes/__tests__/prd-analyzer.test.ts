/**
 * PRD Analyzer node tests.
 * Scope: valid PRD parsing, malformed JSON handling, LLM error handling,
 * mode-aware user message construction, promptVersion threading.
 */

import type { ClarifierDeps } from '../../deps.js';
import type { ClarifierState } from '../../types.js';
import type { Result } from '@agentforge/core';
import type { CompletionResult, ProviderError } from '@agentforge/providers';
import { createPrdAnalyzer, buildUserMessage, _resetPromptCache } from '../prd-analyzer.js';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('node:url', () => ({
  fileURLToPath: jest.fn(() => '/mock/src/nodes/prd-analyzer.ts'),
}));

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    debugLog: jest.fn(),
  };
});

const { readFileSync } = jest.requireMock('node:fs') as {
  readFileSync: jest.Mock;
};

const MOCK_PROMPT = `---
version: 1.0.0
purpose: Test prompt
---

You are a product requirements analyst.`;

const VALID_PRD = {
  id: 'prd-001',
  title: 'Personal Expense Tracker',
  description: 'Track daily expenses with categories and insights',
  features: [
    { id: 'feat-001', name: 'Add Expense', description: 'Record new expenses with amount and category', priority: 'must-have' as const },
    { id: 'feat-002', name: 'Dashboard', description: 'Overview of spending patterns', priority: 'must-have' as const },
  ],
  personas: [
    { id: 'persona-001', name: 'Budget-Conscious User', role: 'consumer', goals: ['Track daily spending', 'Stay within budget'] },
  ],
  dataEntities: [
    {
      id: 'entity-001',
      name: 'Expense',
      fields: [
        { name: 'amount', type: 'number' },
        { name: 'category', type: 'string' },
        { name: 'date', type: 'date' },
        { name: 'description', type: 'string', required: false },
      ],
    },
  ],
  screens: [
    { id: 'screen-001', name: 'Dashboard', description: 'Overview of expenses and budget' },
    { id: 'screen-002', name: 'Add Expense', description: 'Form to record a new expense', screenType: 'page' as const },
  ],
  nfrs: [
    { id: 'nfr-001', category: 'performance', description: 'Page load time under 2 seconds' },
  ],
  successMetrics: [
    { id: 'metric-001', name: 'Daily Active Users', description: 'Users who log at least one expense per day', target: '60%', measurement: 'analytics' },
  ],
  outOfScope: ['Multi-currency support', 'Bank account integration'],
  version: '1.0.0',
  status: 'draft' as const,
};

function makeCompletionResult(prd: unknown): Result<CompletionResult, ProviderError> {
  return {
    ok: true as const,
    value: {
      content: JSON.stringify(prd),
      structured: prd as Record<string, unknown>,
      toolCalls: [],
      usage: { inputTokens: 500, outputTokens: 1200 },
      cost: { inputCostUsd: 0.0075, outputCostUsd: 0.036, totalCostUsd: 0.0435, model: 'claude-opus-4-6', timestamp: new Date().toISOString() },
      model: 'claude-opus-4-6',
      latencyMs: 3200,
      finishReason: 'stop' as const,
    },
  };
}

function makeState(overrides: Partial<ClarifierState> = {}): ClarifierState {
  return {
    rawInput: 'Build a personal expense tracker app',
    mode: 'bootstrap',
    context: {
      catalog: 'Card:\n  description: Content container',
      platformConstraints: 'Web platform, WCAG 2.1 AA',
    },
    gaps: [],
    questions: [],
    humanResponses: [],
    requirement: null,
    assumptions: null,
    round: 0,
    maxRounds: 3,
    error: null,
    prdDraft: null,
    featurePlan: null,
    criticRetries: 0,
    criticPassed: false,
    escalationDecision: null,
    ...overrides,
  };
}

function makeMockDeps(overrides: Partial<ClarifierDeps> = {}): ClarifierDeps {
  return {
    provider: {
      name: 'mock',
      models: ['claude-opus-4-6'],
      complete: jest.fn(),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn(),
    } as unknown as ClarifierDeps['provider'],
    projectRoot: '/tmp/test-project',
    projectId: 'test-project',
    ...overrides,
  };
}

describe('createPrdAnalyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPromptCache();
    readFileSync.mockReturnValue(MOCK_PROMPT);
  });

  it('returns prdDraft from valid structured LLM response', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_PRD));

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.prdDraft).toBeDefined();
    expect(result.prdDraft!.title).toBe('Personal Expense Tracker');
    expect(result.prdDraft!.features).toHaveLength(2);
    expect(result.prdDraft!.status).toBe('draft');
  });

  it('falls back to parsing content when structured is undefined', async () => {
    const deps = makeMockDeps();
    const completionResult = makeCompletionResult(VALID_PRD);
    (completionResult as { ok: true; value: CompletionResult }).value = {
      ...(completionResult as { ok: true; value: CompletionResult }).value,
      structured: undefined,
      content: JSON.stringify(VALID_PRD),
    };
    (deps.provider.complete as jest.Mock).mockResolvedValue(completionResult);

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.prdDraft).toBeDefined();
    expect(result.prdDraft!.title).toBe('Personal Expense Tracker');
  });

  it('handles JSON wrapped in code fences', async () => {
    const deps = makeMockDeps();
    const completionResult = makeCompletionResult(VALID_PRD);
    (completionResult as { ok: true; value: CompletionResult }).value = {
      ...(completionResult as { ok: true; value: CompletionResult }).value,
      structured: undefined,
      content: '```json\n' + JSON.stringify(VALID_PRD) + '\n```',
    };
    (deps.provider.complete as jest.Mock).mockResolvedValue(completionResult);

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.error).toBeUndefined();
    expect(result.prdDraft).toBeDefined();
  });

  it('returns error when LLM call fails', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', retryAfterMs: 5000 },
    });

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.prdDraft).toBeUndefined();
    expect(result.error).toBe('PRD Analyzer LLM call failed: RATE_LIMITED');
  });

  it('returns error when response is not valid JSON', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue({
      ok: true,
      value: {
        content: 'This is not JSON at all',
        structured: undefined,
        toolCalls: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: { inputCostUsd: 0.001, outputCostUsd: 0.001, totalCostUsd: 0.002, model: 'claude-opus-4-6', timestamp: new Date().toISOString() },
        model: 'claude-opus-4-6',
        latencyMs: 500,
        finishReason: 'stop',
      },
    });

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.prdDraft).toBeUndefined();
    expect(result.error).toBe('PRD Analyzer: response is not valid JSON');
  });

  it('returns error when response fails Zod validation', async () => {
    const deps = makeMockDeps();
    const invalidPrd = { ...VALID_PRD, features: 'not-an-array' };
    (deps.provider.complete as jest.Mock).mockResolvedValue(
      makeCompletionResult(invalidPrd),
    );

    const node = createPrdAnalyzer(deps);
    const result = await node(makeState());

    expect(result.prdDraft).toBeUndefined();
    expect(result.error).toContain('PRD Analyzer: invalid response');
    expect(result.error).toContain('features');
  });

  it('passes claude-opus-4-6 model and responseSchema to provider', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_PRD));

    const node = createPrdAnalyzer(deps);
    await node(makeState());

    const [, options] = (deps.provider.complete as jest.Mock).mock.calls[0];
    expect(options.model).toBe('claude-opus-4-6');
    expect(options.temperature).toBe(0);
    expect(options.maxTokens).toBe(8192);
    expect(options.responseSchema).toBeDefined();
    expect(options.responseSchema.schema.type).toBe('object');
  });

  it('threads promptVersion from frontmatter to provider options', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_PRD));

    const node = createPrdAnalyzer(deps);
    await node(makeState());

    const [, options] = (deps.provider.complete as jest.Mock).mock.calls[0];
    expect(options.promptVersion).toBe('1.0.0');
  });

  it('caches prompt after first load', async () => {
    const deps = makeMockDeps();
    (deps.provider.complete as jest.Mock).mockResolvedValue(makeCompletionResult(VALID_PRD));

    const node = createPrdAnalyzer(deps);
    await node(makeState());
    await node(makeState());

    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('buildUserMessage', () => {
  it('includes mode and rawInput', () => {
    const msg = buildUserMessage(makeState());
    expect(msg).toContain('## Mode: bootstrap');
    expect(msg).toContain('Build a personal expense tracker app');
  });

  it('includes catalog and platform constraints from context', () => {
    const msg = buildUserMessage(makeState());
    expect(msg).toContain('## Available Component Catalog');
    expect(msg).toContain('Card:');
    expect(msg).toContain('## Platform Constraints');
    expect(msg).toContain('WCAG 2.1 AA');
  });

  it('includes evolution-mode context when mode is evolution', () => {
    const state = makeState({
      mode: 'evolution',
      context: {
        catalog: 'Card: content container',
        platformConstraints: 'Web',
        codeChunks: ['src/app.ts:1-5\nexport function main() {}'],
        docChunks: ['docs/README.md\n# Overview\nProject docs'],
        designChunks: ['screen:dashboard designs/dashboard.json\n{"nodes":{}}'],
        repoMap: 'src/\n  app.ts: main()',
      },
    });
    const msg = buildUserMessage(state);

    expect(msg).toContain('## Existing Code Context');
    expect(msg).toContain('src/app.ts');
    expect(msg).toContain('## Existing Documentation');
    expect(msg).toContain('README.md');
    expect(msg).toContain('## Existing Designs');
    expect(msg).toContain('screen:dashboard');
    expect(msg).toContain('## Repository Structure');
    expect(msg).toContain('app.ts: main()');
  });

  it('excludes evolution sections in bootstrap mode', () => {
    const state = makeState({
      mode: 'bootstrap',
      context: {
        catalog: 'Card: test',
        codeChunks: ['some code'],
        docChunks: ['some doc'],
      },
    });
    const msg = buildUserMessage(state);

    expect(msg).not.toContain('## Existing Code Context');
    expect(msg).not.toContain('## Existing Documentation');
  });
});
