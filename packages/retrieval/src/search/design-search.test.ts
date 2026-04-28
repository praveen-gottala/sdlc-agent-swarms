/**
 * Scope: design-search.ts — hybrid design search with reranking.
 * Mocks: Voyage embedQuery, Qdrant hybridSearch, Cohere rerank.
 * Canonical test for design search lives here, not in tools/.
 */

import { searchDesigns, type DesignSearchDeps } from './design-search.js';
import type { DesignSearchOptions } from '../types.js';

jest.mock('../clients/voyage-client.js', () => ({
  embedQuery: jest.fn(),
}));

import { embedQuery } from '../clients/voyage-client.js';

function makeDeps(overrides: Partial<DesignSearchDeps> = {}): DesignSearchDeps {
  return {
    voyageClient: {} as DesignSearchDeps['voyageClient'],
    voyageConfig: { apiKey: 'test', codeModel: 'voyage-code-3', docsModel: 'voyage-3-large', outputDimension: 1024, maxBatchSize: 128 },
    cohere: {
      rerank: jest.fn().mockResolvedValue({
        ok: true as const,
        value: [{
          chunk: { filePath: 'designs/dashboard.json', content: 'card node', screenId: 'dashboard', catalogEntry: 'Card', contentHash: 'abc' },
          relevanceScore: 0.95,
          originalIndex: 0,
        }],
      }),
    },
    qdrant: {
      ensureCollection: jest.fn(),
      upsertPoints: jest.fn(),
      deleteByFilter: jest.fn(),
      healthCheck: jest.fn().mockResolvedValue({ ok: true, value: true }),
      hybridSearch: jest.fn().mockResolvedValue({
        ok: true,
        value: [{
          id: 'hit-1',
          score: 0.8,
          payload: {
            filePath: 'designs/dashboard.json',
            content: 'card node',
            screenId: 'dashboard',
            nodeType: 'container',
            catalogEntry: 'Card',
            contentHash: 'abc',
            projectId: 'test',
          },
        }],
      }),
    },
    designsCollection: 'agentforge_designs',
    ...overrides,
  };
}

const baseOptions: DesignSearchOptions = {
  query: 'settings form with toggle',
  projectId: 'test-project',
};

describe('searchDesigns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (embedQuery as jest.Mock).mockResolvedValue({ ok: true, value: [0.1, 0.2, 0.3] });
  });

  it('returns ranked design chunks from hybrid search + rerank', async () => {
    const deps = makeDeps();
    const result = await searchDesigns(baseOptions, deps);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hits).toHaveLength(1);
    expect(result.value.hits[0]!.chunk.screenId).toBe('dashboard');
    expect(result.value.hits[0]!.chunk.catalogEntry).toBe('Card');
    expect(result.value.query).toBe('settings form with toggle');
    expect(result.value.totalCandidates).toBe(1);
  });

  it('applies screenId filter when provided', async () => {
    const deps = makeDeps();
    await searchDesigns({ ...baseOptions, screenId: 'settings' }, deps);

    const searchCall = (deps.qdrant.hybridSearch as jest.Mock).mock.calls[0];
    const filter = searchCall[4] as Record<string, unknown>;
    const musts = filter['must'] as Array<Record<string, unknown>>;
    expect(musts).toHaveLength(2);
    expect(musts[1]).toEqual({ key: 'screenId', match: { value: 'settings' } });
  });

  it('does not add screenId filter when not provided', async () => {
    const deps = makeDeps();
    await searchDesigns(baseOptions, deps);

    const searchCall = (deps.qdrant.hybridSearch as jest.Mock).mock.calls[0];
    const filter = searchCall[4] as Record<string, unknown>;
    const musts = filter['must'] as Array<Record<string, unknown>>;
    expect(musts).toHaveLength(1);
    expect(musts[0]).toEqual({ key: 'projectId', match: { value: 'test-project' } });
  });

  it('propagates embed failure', async () => {
    (embedQuery as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'VOYAGE_API_ERROR', message: 'API down', recoverable: true },
    });

    const deps = makeDeps();
    const result = await searchDesigns(baseOptions, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VOYAGE_API_ERROR');
  });

  it('propagates hybrid search failure', async () => {
    const deps = makeDeps({
      qdrant: {
        ...makeDeps().qdrant,
        hybridSearch: jest.fn().mockResolvedValue({
          ok: false,
          error: { code: 'QDRANT_API_ERROR', message: 'Connection refused', recoverable: true },
        }),
      },
    });

    const result = await searchDesigns(baseOptions, deps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('QDRANT_API_ERROR');
  });

  it('respects limit option', async () => {
    const deps = makeDeps();
    await searchDesigns({ ...baseOptions, limit: 5 }, deps);

    const searchCall = (deps.qdrant.hybridSearch as jest.Mock).mock.calls[0];
    expect(searchCall[3]).toBe(15);
  });
});
