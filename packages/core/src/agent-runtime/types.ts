/**
 * @module @agentforge/core/agent-runtime/types
 *
 * Types for the base-agent execution wrapper.
 * Uses structural typing and function injection to avoid circular
 * dependencies — core cannot import governance or providers.
 */

import type { Result, AgentForgeError, AgentContract, CostEstimate, ProjectManifest } from '../types/index.js';
import type { EventBus } from '../events/index.js';
import type { FileSystem } from '../fs/index.js';
import type { MCPClient } from '../mcp/mcp-client.js';

// ============================================================================
// Governance outcome (structural match for HITLResult)
// ============================================================================

/** Discriminated union matching the governance HITLResult structure. */
export type GovernanceOutcome =
  | { readonly status: 'proceed' }
  | { readonly status: 'pause'; readonly gateId: string }
  | { readonly status: 'notify' }
  | { readonly status: 'denied'; readonly reason: string };

// ============================================================================
// Injected function types
// ============================================================================

/**
 * Governance check function injected by callers.
 * Wraps the real governance middleware without core importing it.
 */
export type RunGovernanceFn = (
  contract: AgentContract,
  actionType: string,
  target: string,
  description: string,
  costEstimate: CostEstimate,
) => Promise<Result<GovernanceOutcome>>;

/**
 * Minimal structural match for an LLM provider.
 * Uses `unknown` for sub-types to avoid importing provider types into core.
 */
export interface LLMProviderRef {
  readonly name: string;
  complete(prompt: unknown, options: unknown): Promise<Result<unknown>>;
  stream(prompt: unknown, options: unknown): AsyncIterable<unknown>;
  estimateCost(prompt: unknown, options: unknown): CostEstimate;
}

/**
 * Provider resolution function injected by callers.
 * Wraps the real ProviderRegistry.get() call.
 */
export type ResolveProviderFn = (providerString: string) => Result<LLMProviderRef>;

/** Audit recording function injected by callers. */
export type RecordAuditFn = (entry: unknown) => void;

// ============================================================================
// Agent context and execution types
// ============================================================================

/** A captured prompt sent to an LLM provider for tracing. */
export interface PromptTrace {
  readonly stage: string;
  readonly timestamp: string;
  readonly system: string;
  readonly userMessage: string;
  readonly model: string;
  readonly maxTokens: number;
  // ── Response fields (populated after LLM call completes) ──
  readonly responseContent?: string;
  readonly responseStructured?: Record<string, unknown>;
  readonly responseToolCalls?: readonly { readonly name: string; readonly args: Record<string, unknown> }[];
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number };
  readonly cost?: { readonly inputCostUsd: number; readonly outputCostUsd: number; readonly totalCostUsd: number };
  readonly latencyMs?: number;
  readonly finishReason?: string;
  readonly hasVisionInput?: boolean;
}

/** Data for recording a prompt trace response. */
export interface PromptTraceResponse {
  readonly content?: string;
  readonly structured?: Record<string, unknown>;
  readonly toolCalls?: readonly { readonly name: string; readonly args: Record<string, unknown> }[];
  readonly usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly cacheReadTokens?: number; readonly cacheWriteTokens?: number };
  readonly cost?: { readonly inputCostUsd: number; readonly outputCostUsd: number; readonly totalCostUsd: number };
  readonly latencyMs?: number;
  readonly finishReason?: string;
  readonly hasVisionInput?: boolean;
}

/** Record a prompt trace if the context has a trace collector. */
export function recordPromptTrace(
  context: { promptTraces?: PromptTrace[] },
  stage: string,
  prompt: { system: string; messages: { role: string; content: string }[] },
  opts: { model: string; maxTokens: number },
): void {
  if (!context.promptTraces) return;
  context.promptTraces.push({
    stage,
    timestamp: new Date().toISOString(),
    system: prompt.system,
    userMessage: prompt.messages.map(m => m.content).join('\n'),
    model: opts.model,
    maxTokens: opts.maxTokens,
  });
}

/**
 * Record LLM response data on the last trace matching the given stage.
 * Finds the most recent trace with the matching stage name and replaces it
 * with a merged copy that includes the response fields.
 */
export function recordPromptTraceResponse(
  context: { promptTraces?: PromptTrace[] },
  stage: string,
  response: PromptTraceResponse,
): void {
  if (!context.promptTraces) return;
  for (let i = context.promptTraces.length - 1; i >= 0; i--) {
    if (context.promptTraces[i].stage === stage) {
      context.promptTraces[i] = {
        ...context.promptTraces[i],
        responseContent: response.content,
        responseStructured: response.structured,
        responseToolCalls: response.toolCalls,
        usage: response.usage,
        cost: response.cost,
        latencyMs: response.latencyMs,
        finishReason: response.finishReason,
        hasVisionInput: response.hasVisionInput,
      };
      return;
    }
  }
}

/** Everything an agent needs to execute, passed as a single object. */
export interface AgentContext {
  readonly taskId: string;
  readonly projectRoot: string;
  readonly eventBus: EventBus;
  readonly fs: FileSystem;
  /** MCP client for design tool interaction. Optional for agents that don't use MCP (research, planning). */
  readonly mcpClient?: MCPClient;
  readonly runGovernance: RunGovernanceFn;
  readonly resolveProvider: ResolveProviderFn;
  readonly recordAudit: RecordAuditFn;
  readonly abortSignal?: AbortSignal;
  readonly promptTraces?: PromptTrace[];
  /** Project manifest for data-driven model resolution. Optional for backward compatibility. */
  readonly manifest?: Pick<ProjectManifest, 'agents'>;
  /** Model resolved via resolveModelForRole(). Set by runAgent, consumed by work functions. */
  readonly resolvedModel?: string;
}

/**
 * The actual work function an agent implements.
 * Receives resolved provider and learnings — no governance boilerplate.
 */
export type AgentWorkFn<TInput, TOutput> = (
  input: TInput,
  provider: LLMProviderRef,
  learnings: unknown[],
  context: AgentContext,
) => Promise<Result<TOutput>>;

/** Result of running an agent through the base-agent wrapper. */
export type AgentRunResult<TOutput> =
  | { readonly status: 'completed'; readonly output: TOutput }
  | { readonly status: 'paused'; readonly gateId: string }
  | { readonly status: 'denied'; readonly reason: string }
  | { readonly status: 'error'; readonly error: AgentForgeError };
