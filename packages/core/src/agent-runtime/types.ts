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
