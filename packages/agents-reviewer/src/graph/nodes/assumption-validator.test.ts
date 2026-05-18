/**
 * Tests for assumptionValidator node — deterministic contradiction
 * detection, focused LLM pass, error degradation, severity mapping.
 */

import { Ok, Err } from '@agentforge/core';
import type { Diff, AssumptionLedger } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import { createAssumptionValidator } from './assumption-validator.js';
import type { ReviewerDeps } from '../../deps.js';
import type { ReviewerStateType } from '../state.js';

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

function makeFailingProvider(): LLMProvider {
  return {
    name: 'test',
    models: ['test-model'],
    complete: jest.fn().mockResolvedValue(
      Err({ code: 'provider_error', message: 'Service unavailable' }),
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
      path: 'src/database.ts',
      operation: 'modify',
      hunks: [{
        startLine: 1,
        endLine: 10,
        content: '+ const db = new PostgresClient();\n+ const column = db.createColumn("data", "jsonb");',
      }],
    },
  ],
  testsPassed: true,
  typecheckPassed: true,
  lintPassed: true,
};

const MOCK_DEPS: ReviewerDeps = {
  provider: {} as ReviewerDeps['provider'],
  projectRoot: '/tmp/test',
  projectId: 'test',
};

function makeState(overrides: Partial<ReviewerStateType> = {}): ReviewerStateType {
  return {
    diff: SAMPLE_DIFF,
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

describe('assumptionValidator', () => {
  it('returns empty results when ledger is null', async () => {
    const node = createAssumptionValidator(MOCK_DEPS);
    const result = await node(makeState({ assumptionLedger: null }));

    expect(result.assumptionValidationResults).toEqual([]);
  });

  it('returns empty results when ledger has no entries', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const node = createAssumptionValidator(MOCK_DEPS);
    const result = await node(makeState({ assumptionLedger: ledger }));

    expect(result.assumptionValidationResults).toEqual([]);
  });

  it('deterministic pass catches resolved assumption contradiction', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'Use Redis for caching',
          evidence: 'Architecture decision',
          confidence: 0.95,
          blastRadius: 'high',
          requiresConfirmation: false,
          resolvedBy: 'confirmed',
          resolution: 'Redis 7 cluster',
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const diffWithContradiction: Diff = {
      ...SAMPLE_DIFF,
      files: [{
        path: 'src/cache.ts',
        operation: 'add',
        hunks: [{
          startLine: 1,
          endLine: 5,
          content: '+ import { MemcachedClient } from "memcached";\n+ // Replaced Redis with Memcached for simplicity',
        }],
      }],
    };

    const node = createAssumptionValidator(MOCK_DEPS);
    const result = await node(makeState({
      assumptionLedger: ledger,
      diff: diffWithContradiction,
    }));

    const violation = result.assumptionValidationResults!.find(
      (r) => r.assumptionId === 'a1',
    );
    expect(violation).toBeDefined();
    expect(violation!.violated).toBe(true);
    expect(violation!.severity).toBe('blocking');
  });

  it('deterministic pass allows non-contradictory resolved assumption', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'Database supports jsonb columns',
          evidence: 'PostgreSQL docs',
          confidence: 0.95,
          blastRadius: 'medium',
          requiresConfirmation: false,
          resolvedBy: 'confirmed',
          resolution: 'PostgreSQL 14+ supports jsonb',
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const node = createAssumptionValidator(MOCK_DEPS);
    const result = await node(makeState({ assumptionLedger: ledger }));

    const a1 = result.assumptionValidationResults!.find(
      (r) => r.assumptionId === 'a1',
    );
    expect(a1).toBeDefined();
    expect(a1!.violated).toBe(false);
  });

  it('LLM pass invoked only for unresolved assumptions', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'Database supports jsonb',
          evidence: 'Docs',
          confidence: 0.9,
          blastRadius: 'medium',
          requiresConfirmation: false,
          resolvedBy: 'confirmed',
        },
        {
          id: 'a2',
          statement: 'API rate limits allow 1000 req/s',
          evidence: 'Needs verification',
          confidence: 0.5,
          blastRadius: 'high',
          requiresConfirmation: true,
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const provider = makeMockProvider({
      results: [
        { assumptionId: 'a2', violated: false, evidence: 'No rate limit code in diff' },
      ],
    });

    const deps: ReviewerDeps = { provider, projectRoot: '/tmp/test', projectId: 'test' };
    const node = createAssumptionValidator(deps);
    const result = await node(makeState({ assumptionLedger: ledger }));

    expect(provider.complete).toHaveBeenCalledTimes(1);
    const callArgs = (provider.complete as jest.Mock).mock.calls[0];
    const promptContent = callArgs[0].messages[0].content as string;
    expect(promptContent).toContain('API rate limits');
    expect(promptContent).not.toContain('Database supports jsonb');

    // Verify LLM result was merged into assumptionValidationResults
    const results = result.assumptionValidationResults!;
    const a1 = results.find((r) => r.assumptionId === 'a1');
    const a2 = results.find((r) => r.assumptionId === 'a2');
    expect(a1).toBeDefined();
    expect(a2).toBeDefined();
    expect(a2!.violated).toBe(false);
    expect(a2!.assumptionId).toBe('a2');
  });

  it('LLM pass skipped when all assumptions are resolved', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'Database supports jsonb',
          evidence: 'Docs',
          confidence: 0.9,
          blastRadius: 'medium',
          requiresConfirmation: false,
          resolvedBy: 'confirmed',
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const provider = makeMockProvider({ results: [] });
    const deps: ReviewerDeps = { provider, projectRoot: '/tmp/test', projectId: 'test' };
    const node = createAssumptionValidator(deps);
    await node(makeState({ assumptionLedger: ledger }));

    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('degrades gracefully when LLM call fails', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a1',
          statement: 'API supports batch operations',
          evidence: 'Unverified',
          confidence: 0.4,
          blastRadius: 'low',
          requiresConfirmation: true,
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const provider = makeFailingProvider();
    const deps: ReviewerDeps = { provider, projectRoot: '/tmp/test', projectId: 'test' };
    const node = createAssumptionValidator(deps);
    const result = await node(makeState({ assumptionLedger: ledger }));

    expect(result.assumptionValidationResults).toEqual([]);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
    expect(result.errors![0]).toContain('Assumption validation LLM failed');
  });

  it('assigns blocking severity for high blastRadius violations', async () => {
    const ledger: AssumptionLedger = {
      id: 'al-1',
      entries: [
        {
          id: 'a-critical',
          statement: 'Payment API is PCI compliant',
          evidence: 'Unverified',
          confidence: 0.3,
          blastRadius: 'critical',
          requiresConfirmation: true,
        },
        {
          id: 'a-low',
          statement: 'Logging format is JSON',
          evidence: 'Convention',
          confidence: 0.6,
          blastRadius: 'low',
          requiresConfirmation: true,
        },
      ],
      createdAt: '2026-01-01',
      lastUpdatedAt: '2026-01-01',
    };

    const provider = makeMockProvider({
      results: [
        { assumptionId: 'a-critical', violated: true, evidence: 'Diff uses non-PCI endpoint' },
        { assumptionId: 'a-low', violated: true, evidence: 'Diff uses plain text logging' },
      ],
    });

    const deps: ReviewerDeps = { provider, projectRoot: '/tmp/test', projectId: 'test' };
    const node = createAssumptionValidator(deps);
    const result = await node(makeState({ assumptionLedger: ledger }));

    const critical = result.assumptionValidationResults!.find(
      (r) => r.assumptionId === 'a-critical',
    );
    const low = result.assumptionValidationResults!.find(
      (r) => r.assumptionId === 'a-low',
    );

    expect(critical!.severity).toBe('blocking');
    expect(low!.severity).toBe('warning');
  });
});
