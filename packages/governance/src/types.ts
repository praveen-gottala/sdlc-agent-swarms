/**
 * @module @agentforge/governance
 *
 * Type definitions for the governance middleware layer.
 * Governance wraps every agent execution with permission checks,
 * HITL enforcement, budget tracking, and audit logging.
 */

import type {
  Result,
  AgentContract,
  CostRecord,
  CostEstimate,
  HITLLevel,
  HITLDecision,
  MessageRef,
  ChannelType,
} from '@agentforge/core';

// ============================================================================
// 1. Agent Action Types
// ============================================================================

/**
 * The category of action an agent is attempting.
 * Derived from the permission strings defined in agent contracts.
 */
export type AgentActionType =
  | 'read_spec'
  | 'write_spec'
  | 'read_design'
  | 'write_design'
  | 'read_code'
  | 'write_code'
  | 'read_design_system'
  | 'create_branch'
  | 'create_pr'
  | 'merge_pr'
  | 'trigger_ci'
  | 'read_ci_logs'
  | 'deploy_staging'
  | 'deploy_production'
  | 'send_notification'
  | 'write_tasks';

/**
 * Describes a specific action an agent is attempting to perform.
 * Created before each governance check and carried through the
 * permission -> budget -> HITL pipeline.
 */
export interface AgentAction {
  /** The agent attempting the action. */
  readonly agentId: string;
  /** The task this action belongs to. */
  readonly taskId: string;
  /** The category of action being attempted. */
  readonly type: AgentActionType;
  /** The target resource (file path, PR number, endpoint, etc.). */
  readonly target: string;
  /** Human-readable description of what the agent intends to do. */
  readonly description: string;
  /** SDLC phase this action belongs to. */
  readonly phase: 'design' | 'spec' | 'code' | 'cicd' | 'observe';
  /** ISO-8601 timestamp of when the action was initiated. */
  readonly timestamp: string;
  /** Optional metadata for action-specific context. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ============================================================================
// 2. Permission Types
// ============================================================================

/**
 * Details about why a permission check denied an action.
 */
export interface PermissionDenialReason {
  /** The permission that was required but not granted. */
  readonly requiredPermission: AgentActionType;
  /** Whether the action was explicitly denied (vs. simply not granted). */
  readonly explicitlyDenied: boolean;
  /** Human-readable explanation. */
  readonly message: string;
}

/**
 * Result of a permission validation.
 * On success, contains void. On failure, contains an AgentForgeError
 * with code 'PERMISSION_DENIED'.
 */
export type PermissionCheckResult = Result<void>;

// ============================================================================
// 3. HITL Types
// ============================================================================

/**
 * Result of enforcing a HITL policy on an action.
 * Discriminated union on `status` matching the four outcomes
 * defined in the architecture specification.
 */
export type HITLResult =
  | { readonly status: 'proceed' }
  | { readonly status: 'pause'; readonly gateId: string; readonly channels: readonly MessageRef[] }
  | { readonly status: 'notify'; readonly channels: readonly MessageRef[] }
  | { readonly status: 'denied'; readonly reason: string };

/**
 * Represents a pending approval gate. Created when HITL enforcement
 * pauses an action and waits for a human decision.
 */
export interface HITLGate {
  /** Unique identifier for this gate. */
  readonly gateId: string;
  /** The action that is paused awaiting approval. */
  readonly action: AgentAction;
  /** The HITL level that triggered this gate. */
  readonly level: HITLLevel;
  /** ISO-8601 timestamp when the gate was created. */
  readonly createdAt: string;
  /** ISO-8601 timestamp when the gate expires (triggers escalation). */
  readonly expiresAt: string;
  /** Whether the gate has been escalated to a secondary channel. */
  readonly escalated: boolean;
  /** Channel references where approval was requested. */
  readonly channels: readonly MessageRef[];
  /** The human's decision, if one has been made. */
  readonly decision?: HITLDecision;
  /** Optional feedback text from the human. */
  readonly feedback?: string;
  /** ISO-8601 timestamp of when a decision was made. */
  readonly decidedAt?: string;
  /** Identity of the person who decided (e.g. "human:praveen"). */
  readonly decidedBy?: string;
}

/**
 * SDLC phases that can have per-phase HITL overrides.
 * Matches the override keys in the project manifest schema.
 */
export type HITLPhase =
  | 'design'
  | 'spec_review'
  | 'code_generation'
  | 'test_generation'
  | 'staging_deploy'
  | 'production_deploy'
  | 'observability';

/**
 * Controls which channels receive which types of messages.
 */
export interface HITLRouting {
  /** Where to send approval requests: all channels or primary only. */
  readonly approvalRequests: 'all' | 'primary';
  /** Where to send status updates: all channels or primary only. */
  readonly statusUpdates: 'all' | 'primary';
  /** Critical alerts always go to all channels. */
  readonly criticalAlerts: 'all';
}

/**
 * Configuration for what happens when a HITL gate times out.
 * The framework NEVER auto-approves a gated action on timeout.
 */
export interface EscalationConfig {
  /** Minutes to wait before escalating. Default: 60. */
  readonly timeoutMinutes: number;
  /** Behavior when the primary timeout expires. */
  readonly onTimeout: 'pause_and_notify';
  /** Minutes to wait on the escalation channel before full pause. */
  readonly secondaryTimeoutMinutes: number;
  /** Channel types to escalate to, in priority order. */
  readonly escalationChannels?: readonly ChannelType[];
}

/**
 * Full HITL configuration combining default policy, per-phase overrides,
 * channel routing, and escalation behavior.
 * Mirrors the `hitl` section of agentforge.yaml.
 */
export interface HITLConfig {
  /** Default HITL level applied when no phase-specific override exists. */
  readonly defaultLevel: HITLLevel;
  /** Per-phase HITL level overrides. */
  readonly overrides: Readonly<Partial<Record<HITLPhase, HITLLevel>>>;
  /** Channel routing configuration. */
  readonly routing: HITLRouting;
  /** Escalation behavior on timeout. */
  readonly escalation: EscalationConfig;
}

// ============================================================================
// 4. Budget Types
// ============================================================================

/**
 * Budget limits configuration.
 * Mirrors the `budget` section of agentforge.yaml.
 */
export interface BudgetConfig {
  /** Maximum USD spend per individual task execution. Default: 2.00. */
  readonly perTaskMaxUsd: number;
  /** Maximum USD spend per SDLC phase. Default: 25.00. */
  readonly perPhaseMaxUsd: number;
  /** Maximum USD spend per calendar month. Default: 200.00. */
  readonly monthlyMaxUsd: number;
  /**
   * Fraction of budget at which to send a warning alert.
   * Default: 0.8 (80%). Must be between 0 and 1.
   */
  readonly alertThreshold: number;
}

/** The level at which a budget limit applies. */
export type BudgetLevel = 'task' | 'phase' | 'project';

/**
 * Current spend tracking at a specific budget level.
 * Maintained in memory and persisted to state.
 */
export interface BudgetState {
  /** Which budget level this state tracks. */
  readonly level: BudgetLevel;
  /** Identifier for the entity (task ID, phase name, or project ID). */
  readonly entityId: string;
  /** Total USD spent so far. */
  readonly spentUsd: number;
  /** The configured limit in USD. */
  readonly limitUsd: number;
  /** Total tokens consumed (input + output). */
  readonly tokensUsed: number;
  /** Whether the alert threshold has been reached and alert sent. */
  readonly alertSent: boolean;
  /** Whether the budget is exhausted (hard stop triggered). */
  readonly exhausted: boolean;
  /** ISO-8601 timestamp of last cost recording. */
  readonly lastUpdated: string;
  /** Individual cost records contributing to this state. */
  readonly records: readonly CostRecord[];
}

/**
 * Alert emitted when spending approaches or exceeds a budget limit.
 */
export interface BudgetAlert {
  /** Which budget level triggered the alert. */
  readonly level: BudgetLevel;
  /** Identifier for the entity. */
  readonly entityId: string;
  /** Current spend in USD. */
  readonly currentSpendUsd: number;
  /** The budget limit in USD. */
  readonly limitUsd: number;
  /** Spend as a fraction of limit (0 to 1+). */
  readonly utilizationRatio: number;
  /** Whether this is a warning (threshold) or a hard stop (limit hit). */
  readonly severity: 'warning' | 'hard_stop';
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Human-readable message. */
  readonly message: string;
}

// ============================================================================
// 5. Audit Types
// ============================================================================

/**
 * The outcome of an audited action.
 */
export type AuditOutcome =
  | 'success'
  | 'failure'
  | 'denied_permission'
  | 'denied_budget'
  | 'denied_hitl'
  | 'timeout'
  | 'aborted'
  | 'loop_detected';

/**
 * Record of which governance checks were applied and their results.
 */
export interface GovernanceCheckRecord {
  /** Whether permission check passed. */
  readonly permissionGranted: boolean;
  /** Whether budget check passed. */
  readonly budgetApproved: boolean;
  /** The HITL result status for this action. */
  readonly hitlResult: HITLResult['status'];
  /** Error details if any check failed. */
  readonly denialReason?: string;
}

/**
 * An immutable audit trail entry recording a single agent action.
 * Captures who, what, when, cost, result, and approver.
 */
// DEVIATION: ADR-009
// PRD v2.0 Section 19.3 specifies: "agent identity, action taken, input context, output produced, approving human, cost incurred, and timestamp"
// Implementation: inputContext, outputProduced, gitCommitSha are optional fields for backward compatibility
// Rationale: see ADR-009
export interface AuditEntry {
  /** Unique identifier for this audit entry. */
  readonly id: string;
  /** ISO-8601 timestamp of when the action occurred. */
  readonly timestamp: string;
  /** The agent that performed the action (PRD 19.3: agent_identity). */
  readonly agentId: string;
  /** The task the action belonged to. */
  readonly taskId: string;
  /** The SDLC phase. */
  readonly phase: 'design' | 'spec' | 'code' | 'cicd' | 'observe';
  /** The action that was performed (PRD 19.3: action_taken). */
  readonly action: AgentAction;
  /** Outcome of the action. */
  readonly outcome: AuditOutcome;
  /** Input context for the action (PRD 19.3: input_context). */
  readonly inputContext?: string;
  /** Output produced by the action (PRD 19.3: output_produced). */
  readonly outputProduced?: string;
  /** Cost incurred by this action, if any (PRD 19.3: cost_incurred). */
  readonly cost?: CostRecord;
  /** The HITL decision that authorized this action, if applicable. */
  readonly hitlDecision?: HITLDecision;
  /** Identity of the human who approved, if applicable (PRD 19.3: approving_human). */
  readonly approvedBy?: string;
  /** Git commit SHA if applicable (PRD 19.3: git_commit_sha). */
  readonly gitCommitSha?: string;
  /** The governance checks that were applied. */
  readonly governanceChecks: GovernanceCheckRecord;
  /** Duration of the action in milliseconds. */
  readonly durationMs?: number;
  /** Domain event types emitted as a result of this action. */
  readonly eventsEmitted?: readonly string[];
}

/**
 * Filter criteria for querying the audit log.
 */
export interface AuditFilter {
  /** Filter by agent ID. */
  readonly agentId?: string;
  /** Filter by task ID. */
  readonly taskId?: string;
  /** Filter by SDLC phase. */
  readonly phase?: 'design' | 'spec' | 'code' | 'cicd' | 'observe';
  /** Filter by action type. */
  readonly actionType?: AgentActionType;
  /** Filter by outcome. */
  readonly outcome?: AuditOutcome;
  /** ISO-8601 start of time range (inclusive). */
  readonly from?: string;
  /** ISO-8601 end of time range (inclusive). */
  readonly to?: string;
  /** Filter by minimum cost threshold. */
  readonly costThresholdUsd?: number;
  /** Maximum number of entries to return. */
  readonly limit?: number;
  /** Offset for pagination. */
  readonly offset?: number;
}

/**
 * Supported export formats for the audit log.
 */
export type AuditExportFormat = 'json' | 'csv';

// ============================================================================
// 6. Circuit Breaker Types
// ============================================================================

/**
 * Configuration for the circuit breaker that detects agent loops
 * and excessive failures.
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before the circuit opens
   * and the agent is paused. Default: 5.
   */
  readonly maxConsecutiveFailures: number;
  /**
   * Number of LLM calls without a task state change before
   * the agent is considered looping and force-stopped. Default: 5.
   */
  readonly maxCallsWithoutProgress: number;
  /**
   * Minutes after which an open circuit automatically resets,
   * allowing the agent to retry. Default: 5.
   */
  readonly resetAfterMinutes: number;
}

/** The current state of a circuit breaker for a specific agent. */
export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

/**
 * Monitors agent execution for loops and excessive failures.
 * Tracks per-agent call history and opens the circuit when
 * thresholds are exceeded.
 */
export interface CircuitBreaker {
  /**
   * Record an LLM call result. Returns false if the circuit is open
   * (too many failures), meaning the agent should be paused.
   */
  recordCall(agentId: string, success: boolean): boolean;

  /**
   * Check if an agent has made more than the configured maximum
   * LLM calls without any task state change.
   */
  isLooping(agentId: string, maxCallsWithoutProgress: number): boolean;

  /** Reset the circuit breaker state for a specific agent. */
  reset(agentId: string): void;

  /** Get the current circuit state for an agent. */
  getState(agentId: string): CircuitBreakerState;
}

// ============================================================================
// 7. Top-Level Governance Config and Middleware Interface
// ============================================================================

/**
 * Top-level governance configuration combining all concerns.
 * Assembled from the agentforge.yaml manifest at startup.
 */
export interface GovernanceConfig {
  /** HITL enforcement configuration. */
  readonly hitl: HITLConfig;
  /** Budget limits configuration. */
  readonly budget: BudgetConfig;
  /** Circuit breaker thresholds. */
  readonly circuitBreaker: CircuitBreakerConfig;
}

/**
 * The governance middleware interface. Wraps every agent execution
 * with permission, budget, HITL, and audit checks.
 *
 * Execution flow:
 * 1. checkPermission(agent, action) — if deny, block immediately
 * 2. checkBudget(agent, estimate) — if deny, block immediately
 * 3. enforceHITL(action, config) — may pause and wait for approval
 * 4. Agent executes (only if all checks pass)
 * 5. recordAudit(entry)
 */
export interface GovernanceMiddleware {
  /**
   * Validate that an agent has the required permission for an action.
   * Checks the agent's `permissions` list and `denied` list.
   *
   * @param agent - The agent contract with permissions and denied lists
   * @param action - The action being attempted
   * @returns Ok(void) if permitted, Err with PERMISSION_DENIED if not
   */
  checkPermission(agent: AgentContract, action: AgentAction): Result<void>;

  /**
   * Enforce the HITL policy for an action. May return immediately
   * (proceed/notify) or create a gate and wait for human decision (pause).
   * NEVER auto-approves on timeout.
   *
   * @param action - The action awaiting HITL enforcement
   * @param config - The HITL configuration including escalation rules
   * @returns The HITL result indicating whether to proceed, pause, notify, or deny
   */
  enforceHITL(action: AgentAction, config: HITLConfig): Promise<HITLResult>;

  /**
   * Check whether the agent has sufficient budget for the estimated cost.
   * Checks at all three levels: per-task, per-phase, and per-project.
   * Emits BudgetAlert events when the alert threshold is reached.
   *
   * @param agent - The agent contract with budget configuration
   * @param estimated - The estimated cost of the upcoming action
   * @returns Ok(void) if budget available, Err with BUDGET_EXCEEDED_* if not
   */
  checkBudget(agent: AgentContract, estimated: CostEstimate): Result<void>;

  /**
   * Record an immutable audit trail entry. Fire-and-forget —
   * audit recording must never block agent execution.
   *
   * @param entry - The audit entry to record
   */
  recordAudit(entry: AuditEntry): void;
}
