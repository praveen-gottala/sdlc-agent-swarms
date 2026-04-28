/**
 * @module @agentforge/retrieval/tools/search-docs-tool
 *
 * MCP-compatible tool definition for semantic document search.
 */

import type { DocSearchOptions } from '../types.js';

export const searchDocsToolDefinition = {
  name: 'searchDocs',
  description: 'Search for documentation content relevant to a natural language query. Returns ranked document chunks with file paths, headings, and relevance scores.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      projectId: { type: 'string', description: 'Project identifier for scoping results' },
      limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
      docType: { type: 'string', enum: ['markdown', 'yaml', 'text'], description: 'Filter by document type' },
    },
    required: ['query', 'projectId'],
  },
} as const;

export type SearchDocsToolInput = DocSearchOptions;
