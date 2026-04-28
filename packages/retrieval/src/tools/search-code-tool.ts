/**
 * @module @agentforge/retrieval/tools/search-code-tool
 *
 * MCP-compatible tool definition for semantic code search.
 */

import type { CodeSearchOptions } from '../types.js';

export const searchCodeToolDefinition = {
  name: 'searchCode',
  description: 'Search for code snippets relevant to a natural language query. Returns ranked code chunks with file paths, line numbers, and relevance scores.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      projectId: { type: 'string', description: 'Project identifier for scoping results' },
      limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
      language: { type: 'string', description: 'Filter by programming language (typescript, javascript)' },
    },
    required: ['query', 'projectId'],
  },
} as const;

export type SearchCodeToolInput = CodeSearchOptions;
