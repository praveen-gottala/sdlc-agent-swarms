import { createQdrantClient } from './qdrant-client.js';
import type { QdrantConfig } from '../types.js';

const mockGetCollections = jest.fn();
const mockCreateCollection = jest.fn();
const mockUpsert = jest.fn();
const mockQuery = jest.fn();
const mockDelete = jest.fn();

jest.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: jest.fn().mockImplementation(() => ({
    getCollections: mockGetCollections,
    createCollection: mockCreateCollection,
    upsert: mockUpsert,
    query: mockQuery,
    delete: mockDelete,
  })),
}));

const config: QdrantConfig = {
  url: 'http://localhost:6333',
  codeCollection: 'agentforge_code',
  docsCollection: 'agentforge_docs',
  designsCollection: 'agentforge_designs',
};

describe('QdrantClient', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ensureCollection', () => {
    it('skips creation if collection already exists', async () => {
      mockGetCollections.mockResolvedValue({ collections: [{ name: 'test_coll' }] });

      const client = createQdrantClient(config);
      const result = await client.ensureCollection({ name: 'test_coll', denseSize: 1024, denseDistance: 'Cosine' });

      expect(result.ok).toBe(true);
      expect(mockCreateCollection).not.toHaveBeenCalled();
    });

    it('creates collection with dense + sparse vectors if not exists', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });
      mockCreateCollection.mockResolvedValue({});

      const client = createQdrantClient(config);
      const result = await client.ensureCollection({ name: 'new_coll', denseSize: 1024, denseDistance: 'Cosine' });

      expect(result.ok).toBe(true);
      expect(mockCreateCollection).toHaveBeenCalledWith('new_coll', {
        vectors: { dense: { size: 1024, distance: 'Cosine' } },
        sparse_vectors: { sparse: {} },
      });
    });

    it('returns QDRANT_CONNECTION_FAILED on ECONNREFUSED', async () => {
      mockGetCollections.mockRejectedValue(new Error('ECONNREFUSED'));

      const client = createQdrantClient(config);
      const result = await client.ensureCollection({ name: 'x', denseSize: 1024, denseDistance: 'Cosine' });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('QDRANT_CONNECTION_FAILED');
    });
  });

  describe('upsertPoints', () => {
    it('upserts points with dense + sparse vectors', async () => {
      mockUpsert.mockResolvedValue({});

      const client = createQdrantClient(config);
      const result = await client.upsertPoints('test_coll', [
        {
          id: 'p1',
          vector: { dense: [0.1, 0.2], sparse: { indices: [1, 5], values: [0.8, 0.3] } },
          payload: { filePath: 'src/test.ts' },
        },
      ]);

      expect(result.ok).toBe(true);
      expect(mockUpsert).toHaveBeenCalledWith('test_coll', {
        wait: true,
        points: [
          {
            id: 'p1',
            vector: { dense: [0.1, 0.2], sparse: { indices: [1, 5], values: [0.8, 0.3] } },
            payload: { filePath: 'src/test.ts' },
          },
        ],
      });
    });
  });

  describe('hybridSearch', () => {
    it('performs hybrid search with dense + sparse prefetch and RRF fusion', async () => {
      mockQuery.mockResolvedValue({
        points: [
          { id: 'p1', score: 0.9, payload: { filePath: 'a.ts' } },
          { id: 'p2', score: 0.7, payload: { filePath: 'b.ts' } },
        ],
      });

      const client = createQdrantClient(config);
      const result = await client.hybridSearch(
        'test_coll',
        [0.1, 0.2],
        { indices: [1, 5], values: [0.8, 0.3] },
        10,
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(2);
      expect(result.value[0]!.id).toBe('p1');
      expect(result.value[0]!.score).toBe(0.9);
      expect(result.value[0]!.payload).toEqual({ filePath: 'a.ts' });

      expect(mockQuery).toHaveBeenCalledWith('test_coll', expect.objectContaining({
        query: { fusion: 'rrf' },
        limit: 10,
        with_payload: true,
      }));
    });

    it('uses dense-only search when no sparse vector provided', async () => {
      mockQuery.mockResolvedValue({ points: [] });

      const client = createQdrantClient(config);
      await client.hybridSearch('test_coll', [0.1], undefined, 5);

      const callArgs = mockQuery.mock.calls[0]![1] as Record<string, unknown>;
      const prefetch = callArgs['prefetch'] as Array<Record<string, unknown>>;
      expect(prefetch).toHaveLength(1);
      expect(prefetch[0]!['using']).toBe('dense');
    });
  });

  describe('deleteByFilter', () => {
    it('deletes points by filter', async () => {
      mockDelete.mockResolvedValue({});

      const client = createQdrantClient(config);
      const result = await client.deleteByFilter('test_coll', {
        must: [{ key: 'projectId', match: { value: 'proj-1' } }],
      });

      expect(result.ok).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('test_coll', {
        wait: true,
        filter: { must: [{ key: 'projectId', match: { value: 'proj-1' } }] },
      });
    });
  });

  describe('healthCheck', () => {
    it('returns true when Qdrant is reachable', async () => {
      mockGetCollections.mockResolvedValue({ collections: [] });

      const client = createQdrantClient(config);
      const result = await client.healthCheck();

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe(true);
    });

    it('returns error when Qdrant is unreachable', async () => {
      mockGetCollections.mockRejectedValue(new Error('ECONNREFUSED'));

      const client = createQdrantClient(config);
      const result = await client.healthCheck();

      expect(result.ok).toBe(false);
    });
  });
});
