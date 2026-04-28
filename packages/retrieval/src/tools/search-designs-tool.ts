/**
 * @module @agentforge/retrieval/tools/search-designs-tool
 *
 * MCP-compatible tool definition for semantic design search.
 */

import type { DesignSearchOptions } from '../types.js';

export const searchDesignsToolDefinition = {
  name: 'searchDesigns',
  description: 'Search for UI design elements relevant to a natural language query. Returns ranked design spec nodes with screen IDs, catalog entries, and relevance scores.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query about UI elements or designs' },
      projectId: { type: 'string', description: 'Project identifier for scoping results' },
      limit: { type: 'number', description: 'Maximum number of results (default: 10)' },
      screenId: { type: 'string', description: 'Filter by screen identifier' },
    },
    required: ['query', 'projectId'],
  },
} as const;

export type SearchDesignsToolInput = DesignSearchOptions;
