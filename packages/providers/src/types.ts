/**
 * @module @agentforge/providers/types
 *
 * LLM provider abstraction types.
 * Defines the common interface all LLM providers must implement.
 */

import type { Result, CostRecord, CostEstimate } from '@agentforge/core';

// ── Prompt & Message Types ──────────────────────────────────────────

/** Structured prompt sent to an LLM provider. */
export interface Prompt {
  /** System prompt defining agent role and conventions. */
  readonly system: string;
  /** Conversation history. */
  readonly messages: Message[];
  /** MCP tools available to the agent. */
  readonly tools?: ToolDefinition[];
}

/** A single message in the conversation. */
export interface Message {
  readonly role: 'user' | 'assistant' | 'tool_result';
  readonly content: string | ContentBlock[];
}

/** A block of content within a message. */
export type ContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: Record<string, unknown> }
  | { readonly type: 'tool_result'; readonly tool_use_id: string; readonly content: string }
  | { readonly type: 'image'; readonly source: { readonly type: 'base64'; readonly media_type: string; readonly data: string } };

// ── Tool Types ──────────────────────────────────────────────────────

/** Definition of a tool available to the LLM. */
export interface ToolDefinition {
  /** MCP tool name. */
  readonly name: string;
  /** Human-readable description. */
  readonly description: string;
  /** JSON Schema for input parameters. */
  readonly parameters: Record<string, unknown>;
}

/** A tool invocation requested by the LLM. */
export interface ToolCall {
  /** Provider-assigned call ID. */
  readonly id: string;
  /** Tool name. */
  readonly name: string;
  /** Parsed arguments. */
  readonly args: Record<string, unknown>;
}

// ── Completion Types ────────────────────────────────────────────────

/** Options for a completion request. */
export interface CompletionOptions {
  /** Specific model ID (e.g. "claude-sonnet-4-6"). Required. */
  readonly model: string;
  readonly maxTokens?: number;
  /** Default: 0 for code gen, 0.7 for design. */
  readonly temperature?: number;
  readonly stopSequences?: string[];
  /** USD limit for this call — provider self-enforces. */
  readonly budgetLimit?: number;
  /** Cancel underlying HTTP stream on budget/abort. */
  readonly signal?: AbortSignal;
  /**
   * JSON Schema for structured output. When set, providers that support it
   * (e.g. Anthropic output_config) guarantee the response matches this schema.
   * The parsed result is available in CompletionResult.structured.
   */
  readonly responseSchema?: {
    readonly schema: Record<string, unknown>;
  };
}

/** Token usage from a completion. */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Tokens served from prompt cache (cheaper). */
  readonly cacheReadTokens?: number;
  /** Tokens written to prompt cache. */
  readonly cacheWriteTokens?: number;
}

/** Result of a non-streaming completion. */
export interface CompletionResult {
  readonly content: string;
  readonly toolCalls: ToolCall[];
  readonly usage: TokenUsage;
  readonly cost: CostRecord;
  readonly model: string;
  readonly latencyMs: number;
  readonly finishReason: 'stop' | 'max_tokens' | 'tool_use';
  /** Parsed structured output when responseSchema was provided. */
  readonly structured?: Record<string, unknown>;
}

/** A chunk emitted during streaming. */
export type StreamChunk =
  | { readonly type: 'token'; readonly content: string; readonly tokenCount: number }
  | { readonly type: 'tool_call'; readonly id: string; readonly name: string; readonly args: Record<string, unknown> }
  | { readonly type: 'progress'; readonly message: string }
  | { readonly type: 'done'; readonly usage: TokenUsage; readonly cost: CostRecord };

// ── Provider Error ──────────────────────────────────────────────────

/** Errors returned by provider operations. */
export type ProviderError =
  | { readonly code: 'RATE_LIMITED'; readonly retryAfterMs: number }
  | { readonly code: 'PROVIDER_DOWN'; readonly status: number; readonly message: string }
  | { readonly code: 'INVALID_RESPONSE'; readonly raw: string }
  | { readonly code: 'AUTH_FAILED'; readonly message: string }
  | { readonly code: 'MODEL_NOT_FOUND'; readonly model: string }
  | { readonly code: 'BUDGET_EXCEEDED_MID_STREAM'; readonly consumed: number; readonly limit: number };

// ── LLM Provider Interface ─────────────────────────────────────────

/** Common interface that all LLM providers must implement. */
export interface LLMProvider {
  /** Provider identifier (e.g. "claude", "openai", "ollama"). */
  readonly name: string;
  /** All models this provider supports. */
  readonly models: string[];

  /** Request/response mode — simple, for lightweight agents. */
  complete(prompt: Prompt, options: CompletionOptions): Promise<Result<CompletionResult, ProviderError>>;

  /** Streaming mode — for code gen, progress visibility, real-time budget enforcement. */
  stream(prompt: Prompt, options: CompletionOptions): AsyncIterable<StreamChunk>;

  /** Check availability and rate limit status. */
  isAvailable(): Promise<boolean>;

  /** Estimate cost before execution (for governance budget pre-check). */
  estimateCost(prompt: Prompt, options: CompletionOptions): CostEstimate;
}

// ── Provider Registry Types ─────────────────────────────────────────

/** Authentication method for provider. */
export type AuthMethod =
  | { readonly type: 'api_key'; readonly key: string }
  | { readonly type: 'adc' }  // Application Default Credentials (Google Cloud)
  | { readonly type: 'service_account'; readonly keyFile: string }
  | { readonly type: 'bearer_token'; readonly token: string };

/** Configuration for instantiating a provider. */
export interface ProviderConfig {
  /** API key from vault or env (deprecated - use auth.type: 'api_key' instead). */
  readonly apiKey?: string;
  /** Authentication method (supports multiple patterns). */
  readonly auth?: AuthMethod;
  /** For Ollama or custom endpoints. */
  readonly baseUrl?: string;
  /** Request timeout in ms. */
  readonly timeout?: number;
  /** Google Cloud project ID (required for Vertex AI). */
  readonly projectId?: string;
  /** Google Cloud region (for Vertex AI, default: us-central1). */
  readonly region?: string;
}

/** Factory function that creates a provider instance. */
export type ProviderFactory = (model: string, config: ProviderConfig) => LLMProvider;

/** Info about a registered provider. */
export interface ProviderInfo {
  readonly name: string;
  readonly models: string[];
  /** API key present and provider reachable. */
  readonly available: boolean;
}
