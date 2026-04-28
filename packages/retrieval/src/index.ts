/**
 * @module @agentforge/retrieval
 *
 * RAG (Retrieval-Augmented Generation) layer for AgentForge.
 * Provides code, document, and design retrieval via Voyage embeddings,
 * Qdrant vector search, and Cohere reranking.
 *
 * Architecture:
 *   - Clients: Voyage (embeddings), Cohere (reranking), Qdrant (vector store)
 *   - Chunking: AST-based code chunking, header-aware doc chunking
 *   - Indexing: Merkle-tree incremental indexing
 *   - Search: Hybrid dense+sparse with RRF fusion
 *   - Repo Map: Tree-sitter + PageRank structural summary
 *
 * Configuration via environment variables:
 *   - VOYAGE_API_KEY (required)
 *   - COHERE_API_KEY (required)
 *   - QDRANT_URL (default: http://localhost:6333)
 */

// Types
export type {
  RetrievalErrorCode,
  RetrievalError,
  VoyageConfig,
  CohereConfig,
  QdrantConfig,
  RetrievalConfig,
  CodeChunk,
  DocChunk,
  DesignChunk,
  EmbeddingResult,
  SearchHit,
  RerankHit,
  SparseVector,
  IndexResult,
  CodeSearchOptions,
  DocSearchOptions,
  DesignSearchOptions,
  CodeSearchResult,
  DocSearchResult,
  DesignSearchResult,
} from './types.js';

// Config
export { resolveRetrievalConfig } from './config.js';

// Clients
export { createVoyageClient } from './clients/voyage-client.js';
export type { VoyageClient } from './clients/voyage-client.js';
export { createCohereClient } from './clients/cohere-client.js';
export type { CohereClient } from './clients/cohere-client.js';
export { createQdrantClient } from './clients/qdrant-client.js';
export type {
  QdrantClientWrapper,
  QdrantPoint,
  QdrantSearchHit,
  CollectionConfig,
} from './clients/qdrant-client.js';

// Repo Map
export { generateRepoMap } from './repo-map/repo-map.js';
export type { RepoMapOptions } from './repo-map/repo-map.js';
export { parseFile, detectLanguage } from './repo-map/parser.js';
export type { ParsedFile, ParsedSymbol, ParsedImport, SymbolKind } from './repo-map/parser.js';
export { buildSymbolGraph } from './repo-map/graph.js';
export type { SymbolGraph, SymbolNode, SymbolEdge } from './repo-map/graph.js';
export { personalizedPageRank } from './repo-map/pagerank.js';
export type { RankedSymbol, PageRankOptions } from './repo-map/pagerank.js';
export { renderRepoMap } from './repo-map/renderer.js';
export type { RenderOptions } from './repo-map/renderer.js';

// Chunking
export { chunkCodeFile } from './chunking/code-chunker.js';
export type { ChunkOptions } from './chunking/code-chunker.js';
export { chunkMarkdown, chunkYaml, chunkDocument } from './chunking/doc-chunker.js';
export { chunkDesignSpec, chunkCatalog } from './chunking/design-chunker.js';
export { tokenize, buildVocabulary, computeBM25Sparse } from './chunking/bm25.js';
export type { BM25Vocabulary, BM25Config } from './chunking/bm25.js';

// Indexing
export { indexCodebase } from './indexing/code-indexer.js';
export type { CodeIndexerOptions } from './indexing/code-indexer.js';
export { indexDocuments } from './indexing/doc-indexer.js';
export type { DocIndexerOptions } from './indexing/doc-indexer.js';
export { indexDesigns } from './indexing/design-indexer.js';
export type { DesignIndexerOptions } from './indexing/design-indexer.js';
export { buildMerkleTree, diffMerkleTrees, loadMerkleTree, saveMerkleTree } from './indexing/merkle-tree.js';
export type { MerkleTree, MerkleNode, FileChange } from './indexing/merkle-tree.js';

// Search
export { searchCode } from './search/code-search.js';
export type { CodeSearchDeps } from './search/code-search.js';
export { searchDocs } from './search/doc-search.js';
export type { DocSearchDeps } from './search/doc-search.js';
export { searchDesigns } from './search/design-search.js';
export type { DesignSearchDeps } from './search/design-search.js';

// Tools
export { createRetrievalTools, createRetrievalToolsFromEnv } from './tools/tool-factory.js';
export type { RetrievalTools } from './tools/tool-factory.js';
export { searchCodeToolDefinition } from './tools/search-code-tool.js';
export { searchDocsToolDefinition } from './tools/search-docs-tool.js';
export { searchDesignsToolDefinition } from './tools/search-designs-tool.js';
export { getRepoMapToolDefinition } from './tools/get-repo-map-tool.js';
export { findSimilarPatternsToolDefinition } from './tools/find-similar-patterns-tool.js';
