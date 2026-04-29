/**
 * Integration test for the Clarifier pipeline (Task 1.7b).
 * Scope: runClarifierPipeline() wrapper — event emission, threadId,
 * interrupted flag, error handling.
 *
 * Individual node behavior is covered by 108 unit tests in src/nodes/__tests__/.
 * This test verifies the wrapper's lifecycle management around the graph.
 */

import * as realFs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MemorySaver } from '@agentforge/core';
import type { ClarifierInput } from '../src/index.js';
import type { LLMProvider, CompletionResult, ProviderError } from '@agentforge/providers';
import type { Result } from '@agentforge/core';

const MOCK_PROMPT = `---
version: 1.0.0
purpose: Test prompt
---

You are a test prompt.`;

jest.mock('node:url', () => ({
  fileURLToPath: jest.fn(() => '/mock/src/nodes/node.ts'),
}));

jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    readFileSync: jest.fn((filePath: string, encoding?: string) => {
      if (typeof filePath === 'string' && filePath.endsWith('.md')) {
        return MOCK_PROMPT;
      }
      if (typeof filePath === 'string' && filePath.endsWith('.yaml')) {
        return 'Card:\n  description: Content container\n  category: container';
      }
      return actual.readFileSync(filePath, encoding);
    }),
    existsSync: jest.fn((filePath: string) => {
      if (typeof filePath === 'string' && (filePath.endsWith('.md') || filePath.endsWith('.yaml'))) {
        return true;
      }
      return actual.existsSync(filePath);
    }),
  };
});

// Import after mocks
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runClarifierPipeline } = require('../src/index.js') as typeof import('../src/index.js');

const VALID_PRD = {
  id: 'prd-001',
  title: 'Test App',
  description: 'A test application',
  features: [
    { id: 'feat-001', name: 'Dashboard', description: 'Main dashboard', priority: 'must-have' },
  ],
  personas: [{ id: 'p-001', name: 'User', role: 'consumer', goals: ['Use app'] }],
  dataEntities: [{ id: 'e-001', name: 'Item', fields: [{ name: 'name', type: 'string' }] }],
  screens: [{ id: 's-001', name: 'Dashboard', description: 'Overview', screenType: 'page' }],
  nfrs: [{ id: 'nfr-001', category: 'performance', description: 'Fast' }],
  successMetrics: [{ id: 'm-001', name: 'DAU', description: 'Daily users', target: '100', measurement: 'analytics' }],
  outOfScope: [],
  version: '1.0.0',
  status: 'draft',
};

const VALID_FEATURE_PLAN = {
  id: 'fp-001',
  features: [{
    id: 'feat-001',
    name: 'Dashboard',
    description: 'Main dashboard',
    acceptanceCriteria: [
      { id: 'ac-001', condition: 'user opens app', behavior: 'show dashboard', formatted: 'WHEN user opens app THE SYSTEM SHALL show dashboard' },
    ],
    dependencies: [],
  }],
};

const VALID_ENRICHED = {
  id: 'er-001',
  rawInput: 'Build a test app',
  mode: 'bootstrap',
  prd: VALID_PRD,
  assumptionLedger: {
    id: 'al-001',
    entries: [{ id: 'a-1', description: 'Uses PostgreSQL', confidence: 0.7, source: 'inferred', requiresConfirmation: true }],
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  },
  clarificationRounds: [],
  confidence: 0.85,
  createdAt: new Date().toISOString(),
};

function makeCost(): CompletionResult['cost'] {
  return {
    inputCostUsd: 0.01,
    outputCostUsd: 0.02,
    totalCostUsd: 0.03,
    model: 'claude-sonnet-4-6',
    timestamp: new Date().toISOString(),
  };
}

function makeOk(content: unknown): Result<CompletionResult, ProviderError> {
  return {
    ok: true as const,
    value: {
      content: JSON.stringify(content),
      structured: content as Record<string, unknown>,
      toolCalls: [],
      usage: { inputTokens: 100, outputTokens: 200 },
      cost: makeCost(),
      model: 'claude-sonnet-4-6',
      latencyMs: 500,
      finishReason: 'stop' as const,
    },
  };
}

function createMockProvider(): LLMProvider {
  let callCount = 0;
  return {
    name: 'mock-provider',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6'],
    complete: jest.fn(async () => {
      callCount++;
      switch (callCount) {
        case 1: return makeOk(VALID_PRD);
        case 2: return makeOk({ implementations: ['impl1', 'impl2', 'impl3'] });
        case 3: return makeOk({ gaps: [{ id: 'gap-1', description: 'Auth unclear', category: 'ambiguous', confidence: 0.4 }] });
        case 4: return makeOk({ enrichedRequirement: VALID_ENRICHED, featurePlan: VALID_FEATURE_PLAN, assumptions: VALID_ENRICHED.assumptionLedger });
        default: return makeOk({ enrichedRequirement: VALID_ENRICHED, featurePlan: VALID_FEATURE_PLAN, assumptions: VALID_ENRICHED.assumptionLedger });
      }
    }),
    stream: jest.fn(),
    isAvailable: jest.fn().mockResolvedValue(true),
    estimateCost: jest.fn(),
  } as unknown as LLMProvider;
}

function makeInput(overrides: Partial<ClarifierInput> = {}): ClarifierInput {
  const tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'clarifier-test-'));
  return {
    rawInput: 'Build a test app with a dashboard',
    mode: 'bootstrap',
    provider: createMockProvider(),
    projectRoot: tmpDir,
    projectId: 'test-project',
    maxRounds: 3,
    checkpointer: new MemorySaver(),
    ...overrides,
  };
}

describe('runClarifierPipeline integration', () => {
  it('returns Ok result with threadId', async () => {
    const input = makeInput();
    const result = await runClarifierPipeline(input);

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('Pipeline error:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.threadId).toBeDefined();
      expect(typeof result.value.threadId).toBe('string');
      expect(result.value.threadId.length).toBeGreaterThan(0);
    }
  }, 30000);

  it('uses provided threadId', async () => {
    const customThreadId = 'custom-thread-12345';
    const input = makeInput({ threadId: customThreadId });
    const result = await runClarifierPipeline(input);

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('Pipeline error:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.threadId).toBe(customThreadId);
    }
  }, 30000);

  it('state contains typed graph channels after execution', async () => {
    const input = makeInput();
    const result = await runClarifierPipeline(input);

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error('Pipeline error:', result.error);
    }
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { state } = result.value;
      expect(state.mode).toBe('bootstrap');
      expect(state.rawInput).toBe('Build a test app with a dashboard');
      expect(typeof state.round).toBe('number');
      expect(Array.isArray(state.gaps)).toBe(true);
      expect(Array.isArray(state.questions)).toBe(true);
    }
  }, 30000);

  it('emits RequirementsClarified on non-interrupted completion', async () => {
    const tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'clarifier-event-'));
    const input = makeInput({ projectRoot: tmpDir });
    const result = await runClarifierPipeline(input);

    if (result.ok && !result.value.interrupted) {
      const eventsPath = path.join(tmpDir, '.agentforge', 'events.jsonl');
      expect(realFs.existsSync(eventsPath)).toBe(true);
      const content = realFs.readFileSync(eventsPath, 'utf-8').trim();
      const events = content.split('\n').map((line: string) => JSON.parse(line));
      const clarifiedEvent = events.find((e: Record<string, unknown>) => e.type === 'RequirementsClarified');
      expect(clarifiedEvent).toBeDefined();
      expect(clarifiedEvent.source).toBe('clarifier');
      expect(clarifiedEvent.mode).toBe('bootstrap');
      expect(typeof clarifiedEvent.questionCount).toBe('number');
      expect(typeof clarifiedEvent.roundCount).toBe('number');
      expect(typeof clarifiedEvent.timestamp).toBe('number');
    }

    realFs.rmSync(tmpDir, { recursive: true, force: true });
  }, 30000);

  it('returns Err on graph execution failure', async () => {
    const throwingProvider = {
      name: 'throwing',
      models: ['claude-opus-4-6'],
      complete: jest.fn(async () => {
        throw new Error('Network failure');
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn(),
    } as unknown as LLMProvider;

    const input = makeInput({ provider: throwingProvider });
    const result = await runClarifierPipeline(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GRAPH_ERROR');
    }
  }, 30000);

  it('does not emit event on Err result', async () => {
    const tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'clarifier-noevt-'));
    const throwingProvider = {
      name: 'throwing',
      models: ['claude-opus-4-6'],
      complete: jest.fn(async () => {
        throw new Error('Failure');
      }),
      stream: jest.fn(),
      isAvailable: jest.fn().mockResolvedValue(true),
      estimateCost: jest.fn(),
    } as unknown as LLMProvider;

    const input = makeInput({ provider: throwingProvider, projectRoot: tmpDir });
    await runClarifierPipeline(input);

    const eventsPath = path.join(tmpDir, '.agentforge', 'events.jsonl');
    const exists = realFs.existsSync(eventsPath);
    if (exists) {
      const content = realFs.readFileSync(eventsPath, 'utf-8').trim();
      const events = content.split('\n').filter(Boolean).map((line: string) => JSON.parse(line));
      const clarifiedEvent = events.find((e: Record<string, unknown>) => e.type === 'RequirementsClarified');
      expect(clarifiedEvent).toBeUndefined();
    }

    realFs.rmSync(tmpDir, { recursive: true, force: true });
  }, 30000);
});
