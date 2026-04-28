import { createCohereClient } from './cohere-client.js';
import type { CohereConfig } from '../types.js';

const mockRerank = jest.fn();

jest.mock('cohere-ai', () => ({
  CohereClientV2: jest.fn().mockImplementation(() => ({
    rerank: mockRerank,
  })),
}));

const config: CohereConfig = {
  apiKey: 'test-key',
  rerankModel: 'rerank-v3.5',
  topN: 3,
};

describe('CohereClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reranks documents and maps back to chunks', async () => {
    mockRerank.mockResolvedValue({
      results: [
        { index: 2, relevanceScore: 0.95 },
        { index: 0, relevanceScore: 0.70 },
        { index: 1, relevanceScore: 0.30 },
      ],
    });

    const chunks = [
      { id: 'a', content: 'first' },
      { id: 'b', content: 'second' },
      { id: 'c', content: 'third' },
    ];

    const client = createCohereClient(config);
    const result = await client.rerank('what is X?', ['first', 'second', 'third'], chunks);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]!.chunk).toEqual({ id: 'c', content: 'third' });
    expect(result.value[0]!.relevanceScore).toBe(0.95);
    expect(result.value[0]!.originalIndex).toBe(2);

    expect(mockRerank).toHaveBeenCalledWith({
      model: 'rerank-v3.5',
      query: 'what is X?',
      documents: ['first', 'second', 'third'],
      topN: 3,
    });
  });

  it('returns COHERE_RATE_LIMITED on 429 error', async () => {
    mockRerank.mockRejectedValue(Object.assign(new Error('429'), { statusCode: 429 }));

    const client = createCohereClient(config);
    const result = await client.rerank('q', ['d'], ['c']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COHERE_RATE_LIMITED');
    expect(result.error.recoverable).toBe(true);
  });

  it('returns COHERE_AUTH_FAILED on 401 error', async () => {
    mockRerank.mockRejectedValue(Object.assign(new Error('401'), { statusCode: 401 }));

    const client = createCohereClient(config);
    const result = await client.rerank('q', ['d'], ['c']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COHERE_AUTH_FAILED');
    expect(result.error.recoverable).toBe(false);
  });

  it('returns COHERE_API_ERROR on unknown error', async () => {
    mockRerank.mockRejectedValue(new Error('server error'));

    const client = createCohereClient(config);
    const result = await client.rerank('q', ['d'], ['c']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('COHERE_API_ERROR');
    expect(result.error.message).toContain('server error');
  });
});
