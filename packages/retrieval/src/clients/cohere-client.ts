/**
 * @module @agentforge/retrieval/clients/cohere-client
 *
 * Thin wrapper around Cohere SDK for reranking search results.
 */

import { CohereClientV2 } from 'cohere-ai';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { CohereConfig, RerankHit, RetrievalError } from '../types.js';

export interface CohereClient {
  readonly rerank: <T>(query: string, documents: readonly string[], chunks: readonly T[]) => Promise<Result<readonly RerankHit<T>[], RetrievalError>>;
}

function isRateLimitError(e: unknown): boolean {
  if (e instanceof Error && e.message.includes('429')) return true;
  if (typeof e === 'object' && e !== null && 'statusCode' in e && (e as Record<string, unknown>).statusCode === 429) return true;
  return false;
}

function isAuthError(e: unknown): boolean {
  if (e instanceof Error && (e.message.includes('401') || e.message.includes('403'))) return true;
  if (typeof e === 'object' && e !== null && 'statusCode' in e) {
    const code = (e as Record<string, unknown>).statusCode;
    return code === 401 || code === 403;
  }
  return false;
}

/** Create a Cohere reranking client. */
export function createCohereClient(config: CohereConfig): CohereClient {
  const client = new CohereClientV2({ token: config.apiKey });

  return {
    rerank: async <T>(query: string, documents: readonly string[], chunks: readonly T[]) => {
      try {
        const response = await client.rerank({
          model: config.rerankModel,
          query,
          documents: documents as string[],
          topN: config.topN,
        });

        const hits: RerankHit<T>[] = (response.results ?? []).map(r => ({
          chunk: chunks[r.index]!,
          relevanceScore: r.relevanceScore ?? 0,
          originalIndex: r.index,
        }));

        return Ok(hits as readonly RerankHit<T>[]);
      } catch (e: unknown) {
        if (isRateLimitError(e)) {
          return Err({
            code: 'COHERE_RATE_LIMITED',
            message: 'Cohere API rate limit exceeded',
            recoverable: true,
            retryAfterMs: 60_000,
          });
        }
        if (isAuthError(e)) {
          return Err({
            code: 'COHERE_AUTH_FAILED',
            message: 'Cohere API authentication failed — check COHERE_API_KEY',
            recoverable: false,
          });
        }
        return Err({
          code: 'COHERE_API_ERROR',
          message: e instanceof Error ? e.message : String(e),
          recoverable: true,
        });
      }
    },
  };
}
