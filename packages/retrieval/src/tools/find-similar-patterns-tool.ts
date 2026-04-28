/**
 * @module @agentforge/retrieval/tools/find-similar-patterns-tool
 *
 * MCP-compatible tool definition for finding similar code patterns.
 */

export const findSimilarPatternsToolDefinition = {
  name: 'findSimilarPatterns',
  description: 'Find code patterns similar to a given example. Provide a code snippet and get back similar implementations from the codebase. Useful for discovering existing patterns before implementing new features.',
  parameters: {
    type: 'object',
    properties: {
      codeSnippet: { type: 'string', description: 'Example code snippet to find similar patterns for' },
      projectId: { type: 'string', description: 'Project identifier for scoping results' },
      limit: { type: 'number', description: 'Maximum number of results (default: 5)' },
    },
    required: ['codeSnippet', 'projectId'],
  },
} as const;

export interface FindSimilarPatternsToolInput {
  readonly codeSnippet: string;
  readonly projectId: string;
  readonly limit?: number;
}
