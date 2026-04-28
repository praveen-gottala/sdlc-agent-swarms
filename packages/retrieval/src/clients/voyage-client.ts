/**
 * @module @agentforge/retrieval/clients/voyage-client
 *
 * Thin wrapper around VoyageAI SDK for code and document embeddings.
 * Uses Matryoshka scaling (1024-dim truncated from 2048 native).
 */

import { VoyageAIClient } from 'voyageai';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { VoyageConfig, EmbeddingResult, RetrievalError } from '../types.js';

export interface VoyageClient {
  readonly embedCode: (texts: readonly string[]) => Promise<Result<EmbeddingResult, RetrievalError>>;
  readonly embedDocs: (texts: readonly string[]) => Promise<Result<EmbeddingResult, RetrievalError>>;
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

async function embed(
  client: VoyageAIClient,
  texts: readonly string[],
  model: string,
  outputDimension: number,
  inputType: 'document' | 'query',
): Promise<Result<EmbeddingResult, RetrievalError>> {
  try {
    const response = await client.embed({
      input: texts as string[],
      model,
      inputType,
      outputDimension,
    });

    const embeddings = (response.data ?? []).map(d => d.embedding ?? []);
    const totalTokens = response.usage?.totalTokens ?? 0;

    return Ok({
      embeddings,
      model: response.model ?? model,
      totalTokens,
    });
  } catch (e: unknown) {
    if (isRateLimitError(e)) {
      return Err({
        code: 'VOYAGE_RATE_LIMITED',
        message: 'Voyage API rate limit exceeded',
        recoverable: true,
        retryAfterMs: 60_000,
      });
    }
    if (isAuthError(e)) {
      return Err({
        code: 'VOYAGE_AUTH_FAILED',
        message: 'Voyage API authentication failed — check VOYAGE_API_KEY',
        recoverable: false,
      });
    }
    return Err({
      code: 'VOYAGE_API_ERROR',
      message: e instanceof Error ? e.message : String(e),
      recoverable: true,
    });
  }
}

/** Create a Voyage embedding client with code and docs methods. */
export function createVoyageClient(config: VoyageConfig): VoyageClient {
  const client = new VoyageAIClient({ apiKey: config.apiKey });

  return {
    embedCode: (texts) => embed(client, texts, config.codeModel, config.outputDimension, 'document'),
    embedDocs: (texts) => embed(client, texts, config.docsModel, config.outputDimension, 'document'),
  };
}

/** Embed a query string for search (uses query input type for asymmetric retrieval). */
export async function embedQuery(
  client: VoyageAIClient,
  query: string,
  model: string,
  outputDimension: number,
): Promise<Result<readonly number[], RetrievalError>> {
  const result = await embed(client, [query], model, outputDimension, 'query');
  if (!result.ok) return result;
  const first = result.value.embeddings[0];
  if (!first) {
    return Err({ code: 'VOYAGE_API_ERROR', message: 'No embedding returned for query', recoverable: true });
  }
  return Ok(first);
}
