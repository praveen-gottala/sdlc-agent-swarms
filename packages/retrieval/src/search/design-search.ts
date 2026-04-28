/**
 * @module @agentforge/retrieval/search/design-search
 *
 * Hybrid design search: embed query → BM25 → Qdrant hybrid → Cohere rerank.
 */

import { Ok } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { tokenize, computeBM25Sparse } from '../chunking/bm25.js';
import type { BM25Vocabulary } from '../chunking/bm25.js';
import { embedQuery } from '../clients/voyage-client.js';
import { VoyageAIClient } from 'voyageai';
import type { CohereClient } from '../clients/cohere-client.js';
import type { QdrantClientWrapper } from '../clients/qdrant-client.js';
import type {
  DesignSearchOptions,
  DesignSearchResult,
  RetrievalError,
  VoyageConfig,
} from '../types.js';

export interface DesignSearchDeps {
  readonly voyageClient: InstanceType<typeof VoyageAIClient>;
  readonly voyageConfig: VoyageConfig;
  readonly cohere: CohereClient;
  readonly qdrant: QdrantClientWrapper;
  readonly designsCollection: string;
  readonly bm25Vocab?: BM25Vocabulary;
}

/** Search for design chunks relevant to a query. */
export async function searchDesigns(
  options: DesignSearchOptions,
  deps: DesignSearchDeps,
): Promise<Result<DesignSearchResult, RetrievalError>> {
  const start = Date.now();
  const limit = options.limit ?? 10;

  const embedResult = await embedQuery(deps.voyageClient, options.query, deps.voyageConfig.docsModel, deps.voyageConfig.outputDimension);
  if (!embedResult.ok) return embedResult;

  const queryTokens = tokenize(options.query);
  const sparse = deps.bm25Vocab ? computeBM25Sparse(queryTokens, deps.bm25Vocab) : undefined;

  const filter: Record<string, unknown> = {
    must: [{ key: 'projectId', match: { value: options.projectId } }],
  };
  if (options.screenId) {
    (filter['must'] as Array<Record<string, unknown>>).push({ key: 'screenId', match: { value: options.screenId } });
  }

  const searchResult = await deps.qdrant.hybridSearch(deps.designsCollection, embedResult.value as number[], sparse, limit * 3, filter);
  if (!searchResult.ok) return searchResult;

  const hitChunks = searchResult.value.map(h => ({
    chunk: {
      filePath: h.payload['filePath'] as string,
      content: h.payload['content'] as string,
      screenId: h.payload['screenId'] as string,
      nodeType: (h.payload['nodeType'] as string) || undefined,
      catalogEntry: (h.payload['catalogEntry'] as string) || undefined,
      contentHash: h.payload['contentHash'] as string,
    },
    content: h.payload['content'] as string,
  }));

  const rerankResult = await deps.cohere.rerank(options.query, hitChunks.map(h => h.content), hitChunks.map(h => h.chunk));
  if (!rerankResult.ok) return rerankResult;

  return Ok({ hits: rerankResult.value.slice(0, limit), query: options.query, totalCandidates: searchResult.value.length, durationMs: Date.now() - start });
}
