/**
 * @module @agentforge/retrieval/tools/tool-factory
 *
 * Creates all retrieval tools from a shared config.
 * Each tool function follows the Result pattern and has an MCP-compatible definition.
 */

import { VoyageAIClient } from 'voyageai';
import { Ok } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { resolveRetrievalConfig } from '../config.js';
import { createCohereClient } from '../clients/cohere-client.js';
import { createQdrantClient } from '../clients/qdrant-client.js';
import { generateRepoMap } from '../repo-map/repo-map.js';
import { searchCode } from '../search/code-search.js';
import { searchDocs } from '../search/doc-search.js';
import { searchCodeToolDefinition } from './search-code-tool.js';
import { searchDocsToolDefinition } from './search-docs-tool.js';
import { searchDesignsToolDefinition } from './search-designs-tool.js';
import { getRepoMapToolDefinition } from './get-repo-map-tool.js';
import { findSimilarPatternsToolDefinition } from './find-similar-patterns-tool.js';
import type { CodeSearchOptions, DocSearchOptions, CodeSearchResult, DocSearchResult, RetrievalError, RetrievalConfig } from '../types.js';
import type { GetRepoMapToolInput } from './get-repo-map-tool.js';
import type { FindSimilarPatternsToolInput } from './find-similar-patterns-tool.js';

export interface RetrievalTools {
  readonly searchCode: (options: CodeSearchOptions) => Promise<Result<CodeSearchResult, RetrievalError>>;
  readonly searchDocs: (options: DocSearchOptions) => Promise<Result<DocSearchResult, RetrievalError>>;
  readonly getRepoMap: (input: GetRepoMapToolInput) => Promise<Result<string, RetrievalError>>;
  readonly findSimilarPatterns: (input: FindSimilarPatternsToolInput) => Promise<Result<CodeSearchResult, RetrievalError>>;
  readonly definitions: readonly Record<string, unknown>[];
}

/** Create all retrieval tools from config. */
export function createRetrievalTools(
  config: RetrievalConfig,
  rootDir: string,
  projectId: string,
): RetrievalTools {
  const cohere = createCohereClient(config.cohere);
  const qdrant = createQdrantClient(config.qdrant);
  const voyageClient = new VoyageAIClient({ apiKey: config.voyage.apiKey });

  const codeDeps = {
    voyageClient,
    voyageConfig: config.voyage,
    cohere,
    qdrant,
    codeCollection: config.qdrant.codeCollection,
  };

  const docDeps = {
    voyageClient,
    voyageConfig: config.voyage,
    cohere,
    qdrant,
    docsCollection: config.qdrant.docsCollection,
  };

  return {
    searchCode: (options) => searchCode(options, codeDeps),

    searchDocs: (options) => searchDocs(options, docDeps),

    getRepoMap: (input) => generateRepoMap({
      rootDir,
      tokenBudget: input.tokenBudget,
      seedFiles: input.seedFiles as string[] | undefined,
    }),

    findSimilarPatterns: (input) => searchCode(
      { query: input.codeSnippet, projectId: input.projectId, limit: input.limit ?? 5 },
      codeDeps,
    ),

    definitions: [
      searchCodeToolDefinition,
      searchDocsToolDefinition,
      searchDesignsToolDefinition,
      getRepoMapToolDefinition,
      findSimilarPatternsToolDefinition,
    ],
  };
}

/** Convenience: resolve config from env and create tools. */
export function createRetrievalToolsFromEnv(
  rootDir: string,
  projectId: string,
): Result<RetrievalTools, RetrievalError> {
  const configResult = resolveRetrievalConfig();
  if (!configResult.ok) return configResult;
  return Ok(createRetrievalTools(configResult.value, rootDir, projectId));
}
