/**
 * Integration spike: embed → upsert → search → rerank.
 * Skipped without AGENTFORGE_TEST_RETRIEVAL=1 + live API keys.
 */

import { resolveRetrievalConfig } from './config.js';
import { createVoyageClient } from './clients/voyage-client.js';
import { createCohereClient } from './clients/cohere-client.js';
import { createQdrantClient } from './clients/qdrant-client.js';

const SKIP = !process.env['AGENTFORGE_TEST_RETRIEVAL'];
const describeIf = SKIP ? describe.skip : describe;

describeIf('Integration spike: embed → upsert → search → rerank', () => {
  it('full round-trip works with live services', async () => {
    const configResult = resolveRetrievalConfig();
    expect(configResult.ok).toBe(true);
    if (!configResult.ok) return;
    const config = configResult.value;

    const voyage = createVoyageClient(config.voyage);
    const cohere = createCohereClient(config.cohere);
    const qdrant = createQdrantClient(config.qdrant);

    // Health check
    const health = await qdrant.healthCheck();
    expect(health.ok).toBe(true);

    // Ensure test collection
    const testCollection = 'agentforge_spike_test';
    const ensureResult = await qdrant.ensureCollection({
      name: testCollection,
      denseSize: 1024,
      denseDistance: 'Cosine',
    });
    expect(ensureResult.ok).toBe(true);

    // Embed some code snippets
    const snippets = [
      'export function parseYaml(content: string): Result<unknown> { return yaml.parse(content); }',
      'export function readFile(path: string): Promise<string> { return fs.readFile(path, "utf-8"); }',
      'export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });',
    ];

    const embedResult = await voyage.embedCode(snippets);
    expect(embedResult.ok).toBe(true);
    if (!embedResult.ok) return;
    expect(embedResult.value.embeddings).toHaveLength(3);
    expect(embedResult.value.embeddings[0]!.length).toBe(1024);

    // Upsert to Qdrant
    const points = embedResult.value.embeddings.map((emb, i) => ({
      id: `spike-${i}`,
      vector: { dense: emb as number[] },
      payload: { content: snippets[i]!, filePath: `test-${i}.ts`, projectId: 'spike' },
    }));

    const upsertResult = await qdrant.upsertPoints(testCollection, points);
    expect(upsertResult.ok).toBe(true);

    // Search
    const queryEmbedResult = await voyage.embedCode(['Result pattern error handling']);
    expect(queryEmbedResult.ok).toBe(true);
    if (!queryEmbedResult.ok) return;

    const searchResult = await qdrant.hybridSearch(
      testCollection,
      queryEmbedResult.value.embeddings[0]! as number[],
      undefined,
      3,
    );
    expect(searchResult.ok).toBe(true);
    if (!searchResult.ok) return;
    expect(searchResult.value.length).toBeGreaterThan(0);

    // Rerank
    const documents = searchResult.value.map(h => h.payload['content'] as string);
    const rerankResult = await cohere.rerank('Result pattern', documents, searchResult.value);
    expect(rerankResult.ok).toBe(true);
    if (!rerankResult.ok) return;
    expect(rerankResult.value.length).toBeGreaterThan(0);

    // Cleanup
    await qdrant.deleteByFilter(testCollection, {
      must: [{ key: 'projectId', match: { value: 'spike' } }],
    });
  }, 60_000);
});
