import { withEnv } from '@agentforge/core';
import { resolveRetrievalConfig } from './config.js';

describe('resolveRetrievalConfig', () => {
  it('returns config when both API keys are set', async () => {
    const result = await withEnv(
      { VOYAGE_API_KEY: 'vk-test', COHERE_API_KEY: 'ck-test' },
      () => resolveRetrievalConfig(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voyage.apiKey).toBe('vk-test');
    expect(result.value.voyage.codeModel).toBe('voyage-code-3');
    expect(result.value.voyage.docsModel).toBe('voyage-3-large');
    expect(result.value.voyage.outputDimension).toBe(1024);
    expect(result.value.voyage.maxBatchSize).toBe(128);
    expect(result.value.cohere.apiKey).toBe('ck-test');
    expect(result.value.cohere.rerankModel).toBe('rerank-v3.5');
    expect(result.value.cohere.topN).toBe(10);
    expect(result.value.qdrant.url).toBe('http://localhost:6333');
    expect(result.value.qdrant.codeCollection).toBe('agentforge_code');
    expect(result.value.qdrant.docsCollection).toBe('agentforge_docs');
    expect(result.value.qdrant.designsCollection).toBe('agentforge_designs');
  });

  it('returns CONFIG_MISSING when VOYAGE_API_KEY is unset', async () => {
    const result = await withEnv(
      { VOYAGE_API_KEY: undefined, COHERE_API_KEY: 'ck-test' },
      () => resolveRetrievalConfig(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFIG_MISSING');
    expect(result.error.message).toContain('VOYAGE_API_KEY');
  });

  it('returns CONFIG_MISSING when COHERE_API_KEY is unset', async () => {
    const result = await withEnv(
      { VOYAGE_API_KEY: 'vk-test', COHERE_API_KEY: undefined },
      () => resolveRetrievalConfig(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('CONFIG_MISSING');
    expect(result.error.message).toContain('COHERE_API_KEY');
  });

  it('respects QDRANT_URL override', async () => {
    const result = await withEnv(
      { VOYAGE_API_KEY: 'vk', COHERE_API_KEY: 'ck', QDRANT_URL: 'http://remote:6333' },
      () => resolveRetrievalConfig(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.qdrant.url).toBe('http://remote:6333');
  });

  it('respects model overrides via env vars', async () => {
    const result = await withEnv(
      {
        VOYAGE_API_KEY: 'vk',
        COHERE_API_KEY: 'ck',
        VOYAGE_CODE_MODEL: 'voyage-code-2',
        VOYAGE_DOCS_MODEL: 'voyage-2',
        VOYAGE_OUTPUT_DIMENSION: '512',
        VOYAGE_MAX_BATCH_SIZE: '64',
        COHERE_RERANK_MODEL: 'rerank-v2',
        COHERE_TOP_N: '5',
      },
      () => resolveRetrievalConfig(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.voyage.codeModel).toBe('voyage-code-2');
    expect(result.value.voyage.docsModel).toBe('voyage-2');
    expect(result.value.voyage.outputDimension).toBe(512);
    expect(result.value.voyage.maxBatchSize).toBe(64);
    expect(result.value.cohere.rerankModel).toBe('rerank-v2');
    expect(result.value.cohere.topN).toBe(5);
  });
});
