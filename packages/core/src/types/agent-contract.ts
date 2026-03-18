/**
 * @module @agentforge/core/types/agent-contract
 *
 * Agent contract types defining what an agent can do,
 * its permissions, budget, and HITL policy.
 */

/**
 * HITL enforcement levels from most restrictive to least.
 */
export type HITLLevel =
  | 'full_approval'
  | 'review_and_override'
  | 'notify_only'
  | 'fully_autonomous';

/**
 * Human decision on a gated action.
 */
export type HITLDecision = 'approved' | 'rejected' | 'changes_requested';

/**
 * Reference to a message sent on a channel (e.g. "slack:msg_123").
 */
export type MessageRef = string;

/**
 * Supported notification channel types.
 */
export type ChannelType = 'slack' | 'telegram' | 'cli';

/**
 * Agent execution configuration.
 */
export interface AgentExecution {
  readonly mode: 'stream' | 'complete';
  readonly progress_events: boolean;
  readonly max_context_tokens: number;
}

/**
 * Per-agent budget constraints.
 */
export interface AgentBudget {
  readonly max_tokens_per_task: number;
  readonly max_cost_per_task_usd: number;
}

/**
 * The contract that defines an agent's capabilities, constraints,
 * and execution parameters. Loaded from YAML config.
 */
export interface AgentContract {
  readonly role: string;
  readonly description: string;
  readonly category: 'design' | 'spec' | 'code' | 'cicd' | 'observe' | 'research';
  readonly provider: string;
  readonly execution: AgentExecution;
  readonly tools: readonly string[];
  readonly permissions: readonly string[];
  readonly denied: readonly string[];
  readonly hitl_policy: HITLLevel;
  readonly budget: AgentBudget;
  readonly on_complete: string;
  readonly on_error: string;
  readonly context: Readonly<Record<string, unknown>>;
}
