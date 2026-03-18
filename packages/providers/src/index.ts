/**
 * @module @agentforge/providers
 *
 * LLM provider abstraction layer.
 * Provides a common interface for Claude, OpenAI, and extensible third-party providers.
 */

// Types
export type {
  LLMProvider,
  Prompt,
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
