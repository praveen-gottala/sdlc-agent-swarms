import { createVoyageClient } from './voyage-client.js';
import type { VoyageConfig } from '../types.js';

const mockEmbed = jest.fn();

jest.mock('voyageai', () => ({
  VoyageAIClient: jest.fn().mockImplementation(() => ({
    embed: mockEmbed,
  })),
}));

const config: VoyageConfig = {
  apiKey: 'test-key',
  codeModel: 'voyage-code-3',
  docsModel: 'voyage-3-large',
  outputDimension: 1024,
  maxBatchSize: 128,
};

describe('VoyageClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('embedCode returns embeddings on success', async () => {
    mockEmbed.mockResolvedValue({
      data: [
        { embedding: [0.1, 0.2, 0.3] },
        { embedding: [0.4, 0.5, 0.6] },
      ],
      model: 'voyage-code-3',
      usage: { totalTokens: 42 },
    });

    const client = createVoyageClient(config);
    const result = await client.embedCode(['hello', 'world']);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.embeddings).toHaveLength(2);
    expect(result.value.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.value.totalTokens).toBe(42);
    expect(result.value.model).toBe('voyage-code-3');

    expect(mockEmbed).toHaveBeenCalledWith({
      input: ['hello', 'world'],
      model: 'voyage-code-3',
      inputType: 'document',
      outputDimension: 1024,
    });
  });

  it('embedDocs uses the docs model', async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.7] }],
      model: 'voyage-3-large',
      usage: { totalTokens: 10 },
    });

    const client = createVoyageClient(config);
    const result = await client.embedDocs(['some doc']);

    expect(result.ok).toBe(true);
    expect(mockEmbed).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'voyage-3-large' }),
    );
  });

  it('returns VOYAGE_RATE_LIMITED on 429 error', async () => {
    mockEmbed.mockRejectedValue(Object.assign(new Error('429 Too Many Requests'), { statusCode: 429 }));

    const client = createVoyageClient(config);
    const result = await client.embedCode(['text']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VOYAGE_RATE_LIMITED');
    expect(result.error.recoverable).toBe(true);
  });

  it('returns VOYAGE_AUTH_FAILED on 401 error', async () => {
    mockEmbed.mockRejectedValue(Object.assign(new Error('401 Unauthorized'), { statusCode: 401 }));

    const client = createVoyageClient(config);
    const result = await client.embedCode(['text']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VOYAGE_AUTH_FAILED');
    expect(result.error.recoverable).toBe(false);
  });

  it('returns VOYAGE_API_ERROR on unknown error', async () => {
    mockEmbed.mockRejectedValue(new Error('network timeout'));

    const client = createVoyageClient(config);
    const result = await client.embedCode(['text']);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VOYAGE_API_ERROR');
    expect(result.error.message).toContain('network timeout');
    expect(result.error.recoverable).toBe(true);
  });
});
