/**
 * @module @agentforge/providers
 *
 * LLM provider abstraction layer.
 * Provides a common interface for Claude, OpenAI, and extensible third-party providers.
 */

import type { ClaudeAuthResult, ProviderConfig } from './types.js';

// Types
export type {
  LLMProvider,
  Prompt,
  SystemBlock,
  CacheControl,
  Message,
  ContentBlock,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  TokenUsage,
  ToolDefinition,
  ToolCall,
  ProviderError,
  ProviderConfig,
  ProviderFactory,
  ProviderInfo,
  AuthMethod,
  ClaudeAuthResult,
} from './types.js';

// Registry
export { ProviderRegistry, parseProviderString } from './registry.js';

// Providers
export { createClaudeProvider } from './claude/claude-provider.js';
export { createOpenAIProvider } from './openai/openai-provider.js';

// Cost table
export {
  getModelCost,
  setCostOverrides,
  resetCostTable,
  calculateCost,
} from './cost-table.js';
export type { ModelCost } from './cost-table.js';

// Vertex AI config detection
export { detectVertexConfig, getVertexSetupHelp } from './vertex-config.js';

/**
 * Check if Claude auth is available via API key or Vertex AI.
 * Returns a discriminated union indicating the auth method, or null if none found.
 */
export function resolveClaudeAuth(): ClaudeAuthResult | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey) return { type: 'api_key', apiKey };

  // Check Vertex AI env vars
  const useVertex =
    process.env.AGENTFORGE_USE_VERTEX === 'true' ||
    process.env.CLAUDE_CODE_USE_VERTEX === '1' ||
    process.env.ANTHROPIC_VERTEX_PROJECT_ID !== undefined;

  if (useVertex) return { type: 'vertex' };

  return null;
}

/**
 * Convert a ClaudeAuthResult to a ProviderConfig suitable for createClaudeProvider().
 */
export function authResultToProviderConfig(auth: ClaudeAuthResult): ProviderConfig {
  return auth.type === 'api_key' ? { apiKey: auth.apiKey } : {};
}
