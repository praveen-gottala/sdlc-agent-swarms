/**
 * @module @agentforge/governance/governance-middleware
 *
 * Composes all governance components (permission checker, budget tracker,
 * HITL enforcer, audit logger) into a single middleware that wraps
 * every agent execution.
 *
 * Execution flow (ADR-004: budget before HITL to avoid orphaned approval requests):
 * 1. checkPermission — if deny, block immediately
 * 2. checkBudget — if deny, block immediately (sync, no external side effects)
 * 3. enforceHITL — may pause and wait for approval (creates external workflows)
 * 4. Agent executes (only if all checks pass)
 * 5. recordAudit
 */

import { Ok } from '@agentforge/core';
import type { Result, AgentContract, CostEstimate } from '@agentforge/core';
import { checkPermission } from './permission-checker.js';
import { createBudgetTracker } from './budget-tracker.js';
import { createHITLEnforcer } from './hitl-enforcer.js';
import { createAuditLogger } from './audit-logger.js';
import type {
  GovernanceMiddleware,
  GovernanceConfig,
  AgentAction,
  HITLConfig,
  HITLResult,
  AuditEntry,
} from './types.js';

/**
 * Options for creating a GovernanceMiddleware instance.
 */
export interface GovernanceMiddlewareOptions {
  /** The full governance configuration from agentforge.yaml. */
  readonly config: GovernanceConfig;
  /** Optional event publisher for budget alerts and HITL events. */
  readonly eventBus?: { publish(event: unknown): void };
  /** Path for persisting audit entries as JSON lines. */
  readonly auditFilePath?: string;
  /** Minimal file system interface for audit persistence. */
  readonly fs?: {
    appendFile(path: string, content: string): { ok: boolean };
    exists(path: string): boolean;
    mkdir(path: string): { ok: boolean };
  };
}

/**
 * Create a governance middleware that composes permission checking,
 * budget tracking, HITL enforcement, and audit logging.
 *
 * The middleware maintains a `currentAction` context that is set during
 * `checkPermission` and used by `checkBudget`. This works because
 * permission is always the first step in the governance pipeline.
 *
 * @param options - Configuration and dependencies for the middleware
 * @returns A GovernanceMiddleware instance
 */
export const createGovernanceMiddleware = (
  options: GovernanceMiddlewareOptions,
): GovernanceMiddleware => {
  const { config, eventBus, auditFilePath, fs } = options;
  const budgetTracker = createBudgetTracker(config.budget, eventBus);
  const hitlEnforcer = createHITLEnforcer(eventBus);
  const auditLogger = createAuditLogger(fs, auditFilePath);

  // Track the current action context for checkBudget.
  // checkBudget on the interface only takes (agent, estimated) but the
  // internal BudgetTracker needs taskId and phase. Since permission is
  // always called first in the pipeline, we capture the action there.
  let currentAction: AgentAction | undefined;

  return {
    checkPermission(agent: AgentContract, action: AgentAction): Result<void> {
      currentAction = action;
      return checkPermission(agent, action);
    },

    checkBudget(agent: AgentContract, estimated: CostEstimate): Result<void> {
      const taskId = currentAction?.taskId ?? 'unknown';
      const phase = currentAction?.phase ?? 'code';
      return budgetTracker.checkBudget(agent, taskId, phase, estimated);
    },

    async enforceHITL(action: AgentAction, hitlConfig: HITLConfig): Promise<HITLResult> {
      return hitlEnforcer.enforce(action, hitlConfig);
    },

    recordAudit(entry: AuditEntry): void {
      auditLogger.recordAudit(entry);
    },
  };
};

/**
 * Execute the full governance pipeline: permission, budget, then HITL.
 * Short-circuits on the first failure, returning the error result.
 *
 * @param middleware - The governance middleware instance
 * @param agent - The agent contract
 * @param action - The action being attempted
 * @param estimate - The estimated cost of the action
 * @param hitlConfig - The HITL configuration
 * @returns Ok(HITLResult) if all checks pass, Err on any denial
 */
export const executeGovernancePipeline = async (
  middleware: GovernanceMiddleware,
  agent: AgentContract,
  action: AgentAction,
  estimate: CostEstimate,
  hitlConfig: HITLConfig,
): Promise<Result<HITLResult>> => {
  // Order: permission → budget → HITL (see ADR-004 for rationale on budget-before-HITL)
  // Step 1: Permission
  const permResult = middleware.checkPermission(agent, action);
  if (!permResult.ok) {
    return permResult;
  }

  // Step 2: Budget
  const budgetResult = middleware.checkBudget(agent, estimate);
  if (!budgetResult.ok) {
    return budgetResult;
  }

  // Step 3: HITL
  const hitlResult = await middleware.enforceHITL(action, hitlConfig);
  return Ok(hitlResult);
};
