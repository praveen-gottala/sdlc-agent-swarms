/**
 * @module @agentforge/retrieval/types
 *
 * Core types for the retrieval package: configuration, chunks, search results.
 */

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type RetrievalErrorCode =
  | 'VOYAGE_RATE_LIMITED'
  | 'VOYAGE_AUTH_FAILED'
  | 'VOYAGE_API_ERROR'
  | 'COHERE_RATE_LIMITED'
  | 'COHERE_AUTH_FAILED'
  | 'COHERE_API_ERROR'
  | 'QDRANT_CONNECTION_FAILED'
  | 'QDRANT_COLLECTION_NOT_FOUND'
  | 'QDRANT_API_ERROR'
  | 'TREESITTER_PARSE_ERROR'
  | 'INDEXING_PARTIAL_FAILURE'
  | 'CONFIG_MISSING';

export interface RetrievalError {
  readonly code: RetrievalErrorCode;
  readonly message: string;
  readonly recoverable: boolean;
  readonly retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface VoyageConfig {
  readonly apiKey: string;
  readonly codeModel: string;
  readonly docsModel: string;
  readonly outputDimension: number;
  readonly maxBatchSize: number;
}

export interface CohereConfig {
  readonly apiKey: string;
  readonly rerankModel: string;
  readonly topN: number;
}

export interface QdrantConfig {
  readonly url: string;
  readonly apiKey?: string;
  readonly codeCollection: string;
  readonly docsCollection: string;
  readonly designsCollection: string;
}

export interface RetrievalConfig {
  readonly voyage: VoyageConfig;
  readonly cohere: CohereConfig;
  readonly qdrant: QdrantConfig;
}

// ---------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------

export interface CodeChunk {
  readonly filePath: string;
  readonly language: string;
  readonly content: string;
  readonly symbolName?: string;
  readonly symbolType?: 'function' | 'class' | 'method' | 'interface' | 'type' | 'variable' | 'enum';
  readonly startLine: number;
  readonly endLine: number;
  readonly scopeChain: readonly string[];
  readonly contentHash: string;
}

export interface DocChunk {
  readonly filePath: string;
  readonly content: string;
  readonly heading?: string;
  readonly headingLevel?: number;
  readonly docType: 'markdown' | 'yaml' | 'text';
  readonly contentHash: string;
}

export interface DesignChunk {
  readonly filePath: string;
  readonly content: string;
  readonly screenId: string;
  readonly nodeType?: string;
  readonly catalogEntry?: string;
  readonly contentHash: string;
}

// ---------------------------------------------------------------------------
// Embedding results
// ---------------------------------------------------------------------------

export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];
  readonly model: string;
  readonly totalTokens: number;
}

// ---------------------------------------------------------------------------
// Search results
// ---------------------------------------------------------------------------

export interface SearchHit<T = CodeChunk | DocChunk | DesignChunk> {
  readonly chunk: T;
  readonly score: number;
  readonly id: string;
}

export interface RerankHit<T = CodeChunk | DocChunk | DesignChunk> {
  readonly chunk: T;
  readonly relevanceScore: number;
  readonly originalIndex: number;
}

// ---------------------------------------------------------------------------
// Sparse vectors (BM25)
// ---------------------------------------------------------------------------

export interface SparseVector {
  readonly indices: readonly number[];
  readonly values: readonly number[];
}

// ---------------------------------------------------------------------------
// Index results
// ---------------------------------------------------------------------------

export interface IndexResult {
  readonly filesProcessed: number;
  readonly chunksCreated: number;
  readonly pointsUpserted: number;
  readonly errors: readonly RetrievalError[];
  readonly durationMs: number;
  readonly costUsd?: number;
}

// ---------------------------------------------------------------------------
// Search options
// ---------------------------------------------------------------------------

export interface CodeSearchOptions {
  readonly query: string;
  readonly projectId: string;
  readonly limit?: number;
  readonly language?: string;
  readonly filePath?: string;
}

export interface DocSearchOptions {
  readonly query: string;
  readonly projectId: string;
  readonly limit?: number;
  readonly docType?: 'markdown' | 'yaml' | 'text';
}

export interface DesignSearchOptions {
  readonly query: string;
  readonly projectId: string;
  readonly limit?: number;
  readonly screenId?: string;
}

// ---------------------------------------------------------------------------
// Code search result
// ---------------------------------------------------------------------------

export interface CodeSearchResult {
  readonly hits: readonly RerankHit<CodeChunk>[];
  readonly query: string;
  readonly totalCandidates: number;
  readonly durationMs: number;
}

export interface DocSearchResult {
  readonly hits: readonly RerankHit<DocChunk>[];
  readonly query: string;
  readonly totalCandidates: number;
  readonly durationMs: number;
}

export interface DesignSearchResult {
  readonly hits: readonly RerankHit<DesignChunk>[];
  readonly query: string;
  readonly totalCandidates: number;
  readonly durationMs: number;
}
