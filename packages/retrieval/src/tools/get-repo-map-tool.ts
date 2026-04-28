/**
 * @module @agentforge/retrieval/tools/get-repo-map-tool
 *
 * MCP-compatible tool definition for generating a structural repo map.
 */

export const getRepoMapToolDefinition = {
  name: 'getRepoMap',
  description: 'Generate a structural summary of the codebase showing the most important symbols (functions, classes, interfaces) ranked by their cross-reference importance. Useful for understanding codebase architecture.',
  parameters: {
    type: 'object',
    properties: {
      tokenBudget: { type: 'number', description: 'Maximum output size in tokens (default: 2048)' },
      seedFiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files to prioritize in the map (50% of rank budget allocated to symbols in these files)',
      },
    },
    required: [],
  },
} as const;

export interface GetRepoMapToolInput {
  readonly tokenBudget?: number;
  readonly seedFiles?: readonly string[];
}
