/**
 * @module @agentforge/retrieval/clients/qdrant-client
 *
 * Thin wrapper around Qdrant JS client for vector storage and hybrid search.
 * Supports dense + sparse (BM25) vectors with RRF fusion.
 */

import { QdrantClient as QdrantSDK } from '@qdrant/js-client-rest';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { QdrantConfig, SparseVector, RetrievalError } from '../types.js';

/** Qdrant collection configuration for dense + sparse hybrid search. */
export interface CollectionConfig {
  readonly name: string;
  readonly denseSize: number;
  readonly denseDistance: 'Cosine' | 'Dot' | 'Euclid' | 'Manhattan';
}

export interface QdrantPoint {
  readonly id: string;
  readonly vector: {
    readonly dense: readonly number[];
    readonly sparse?: SparseVector;
  };
  readonly payload: Record<string, unknown>;
}

export interface QdrantSearchHit {
  readonly id: string;
  readonly score: number;
  readonly payload: Record<string, unknown>;
}

export interface QdrantClientWrapper {
  readonly ensureCollection: (config: CollectionConfig) => Promise<Result<void, RetrievalError>>;
  readonly upsertPoints: (collection: string, points: readonly QdrantPoint[]) => Promise<Result<void, RetrievalError>>;
  readonly hybridSearch: (collection: string, dense: readonly number[], sparse: SparseVector | undefined, limit: number, filter?: Record<string, unknown>) => Promise<Result<readonly QdrantSearchHit[], RetrievalError>>;
  readonly deleteByFilter: (collection: string, filter: Record<string, unknown>) => Promise<Result<void, RetrievalError>>;
  readonly healthCheck: () => Promise<Result<boolean, RetrievalError>>;
}

function wrapQdrantError(e: unknown): RetrievalError {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
    return { code: 'QDRANT_CONNECTION_FAILED', message: `Qdrant connection failed: ${message}`, recoverable: true };
  }
  if (message.includes('Not found') || message.includes('404')) {
    return { code: 'QDRANT_COLLECTION_NOT_FOUND', message, recoverable: false };
  }
  return { code: 'QDRANT_API_ERROR', message, recoverable: true };
}

/** Create a Qdrant vector store client. */
export function createQdrantClient(config: QdrantConfig): QdrantClientWrapper {
  const client = new QdrantSDK({ url: config.url, apiKey: config.apiKey });

  return {
    ensureCollection: async (collConfig) => {
      try {
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === collConfig.name);
        if (exists) return Ok(undefined);

        await client.createCollection(collConfig.name, {
          vectors: {
            dense: {
              size: collConfig.denseSize,
              distance: collConfig.denseDistance,
            },
          },
          sparse_vectors: {
            sparse: {},
          },
        });
        return Ok(undefined);
      } catch (e: unknown) {
        return Err(wrapQdrantError(e));
      }
    },

    upsertPoints: async (collection, points) => {
      try {
        const qdrantPoints = points.map(p => ({
          id: p.id,
          vector: {
            dense: p.vector.dense as number[],
            ...(p.vector.sparse ? {
              sparse: {
                indices: p.vector.sparse.indices as number[],
                values: p.vector.sparse.values as number[],
              },
            } : {}),
          },
          payload: p.payload,
        }));

        await client.upsert(collection, { wait: true, points: qdrantPoints });
        return Ok(undefined);
      } catch (e: unknown) {
        return Err(wrapQdrantError(e));
      }
    },

    hybridSearch: async (collection, dense, sparse, limit, filter) => {
      try {
        const prefetch = [
          { query: dense as number[], using: 'dense', limit: limit * 3 },
        ];

        if (sparse && sparse.indices.length > 0) {
          prefetch.push({
            query: { indices: sparse.indices as number[], values: sparse.values as number[] } as unknown as number[],
            using: 'sparse',
            limit: limit * 3,
          });
        }

        const response = await client.query(collection, {
          prefetch,
          query: { fusion: 'rrf' },
          limit,
          with_payload: true,
          ...(filter ? { filter } : {}),
        });

        const hits: QdrantSearchHit[] = (response.points ?? []).map(p => ({
          id: String(p.id),
          score: p.score ?? 0,
          payload: (p.payload ?? {}) as Record<string, unknown>,
        }));

        return Ok(hits as readonly QdrantSearchHit[]);
      } catch (e: unknown) {
        return Err(wrapQdrantError(e));
      }
    },

    deleteByFilter: async (collection, filter) => {
      try {
        await client.delete(collection, { wait: true, filter });
        return Ok(undefined);
      } catch (e: unknown) {
        return Err(wrapQdrantError(e));
      }
    },

    healthCheck: async () => {
      try {
        await client.getCollections();
        return Ok(true);
      } catch (e: unknown) {
        return Err(wrapQdrantError(e));
      }
    },
  };
}
