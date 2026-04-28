/**
 * @module @agentforge/retrieval/search/code-search
 *
 * Hybrid code search: embed query → BM25 sparse → Qdrant hybrid (RRF) → Cohere rerank.
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
  CodeChunk,
  CodeSearchOptions,
  CodeSearchResult,
  RetrievalError,
  VoyageConfig,
} from '../types.js';

export interface CodeSearchDeps {
  readonly voyageClient: InstanceType<typeof VoyageAIClient>;
  readonly voyageConfig: VoyageConfig;
  readonly cohere: CohereClient;
  readonly qdrant: QdrantClientWrapper;
  readonly codeCollection: string;
  readonly bm25Vocab?: BM25Vocabulary;
}

/** Search for code chunks relevant to a query. */
export async function searchCode(
  options: CodeSearchOptions,
  deps: CodeSearchDeps,
): Promise<Result<CodeSearchResult, RetrievalError>> {
  const start = Date.now();
  const limit = options.limit ?? 10;

  // Embed query
  const embedResult = await embedQuery(
    deps.voyageClient,
    options.query,
    deps.voyageConfig.codeModel,
    deps.voyageConfig.outputDimension,
  );
  if (!embedResult.ok) return embedResult;
  const denseVector = embedResult.value;

  // BM25 sparse vector for query
  const queryTokens = tokenize(options.query);
  const sparse = deps.bm25Vocab
    ? computeBM25Sparse(queryTokens, deps.bm25Vocab)
    : undefined;

  // Build filter
  const filter: Record<string, unknown> = {
    must: [{ key: 'projectId', match: { value: options.projectId } }],
  };
  if (options.language) {
    (filter['must'] as Array<Record<string, unknown>>).push(
      { key: 'language', match: { value: options.language } },
    );
  }

  // Hybrid search
  const searchResult = await deps.qdrant.hybridSearch(
    deps.codeCollection,
    denseVector as number[],
    sparse,
    limit * 3,
    filter,
  );
  if (!searchResult.ok) return searchResult;

  // Map hits to CodeChunks
  const hitChunks = searchResult.value.map(h => ({
    chunk: {
      filePath: h.payload['filePath'] as string,
      language: h.payload['language'] as string,
      content: h.payload['content'] as string,
      symbolName: (h.payload['symbolName'] as string) || undefined,
      symbolType: (h.payload['symbolType'] as string as CodeChunk['symbolType']) || undefined,
      startLine: h.payload['startLine'] as number,
      endLine: h.payload['endLine'] as number,
      scopeChain: (h.payload['scopeChain'] as string[]) ?? [],
      contentHash: h.payload['contentHash'] as string,
    },
    content: h.payload['content'] as string,
    score: h.score,
  }));

  // Rerank
  const documents = hitChunks.map(h => h.content);
  const chunks = hitChunks.map(h => h.chunk);
  const rerankResult = await deps.cohere.rerank(options.query, documents, chunks);
  if (!rerankResult.ok) return rerankResult;

  return Ok({
    hits: rerankResult.value.slice(0, limit),
    query: options.query,
    totalCandidates: searchResult.value.length,
    durationMs: Date.now() - start,
  });
}
