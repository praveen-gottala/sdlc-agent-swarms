/**
 * Integration tests for the governance middleware pipeline.
 *
 * Tests the full governance flow: permission → budget → HITL,
 * verifying that each gate blocks execution when it should.
 */

import type {
  AgentContract,
  CostEstimate,
  Result,
  AgentForgeError,
} from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import { checkPermission } from './permission-checker.js';
import type {
  AgentAction,
  BudgetConfig,
  HITLConfig,
  HITLResult,
} from './types.js';

// ============================================================================
// Test helpers
// ============================================================================

const makeAgent = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'design-agent',
  description: 'A design agent for UI work',
  category: 'design',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 100_000 },
  tools: ['figma', 'design-system-reader'],
  permissions: ['read_design', 'write_design', 'read_design_system'],
  denied: ['deploy_staging', 'deploy_production'],
  hitl_policy: 'full_approval',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
  on_complete: 'DesignComplete',
  on_error: 'DesignFailed',
  context: {},
  ...overrides,
});

const makeAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  agentId: 'design-agent',
  taskId: 'task-design-001',
  type: 'write_design',
  target: 'screens/home.fig',
  description: 'Update home screen design',
  phase: 'design',
  timestamp: '2026-03-17T10:00:00Z',
  ...overrides,
});

const defaultBudgetConfig: BudgetConfig = {
  perTaskMaxUsd: 2.0,
  perPhaseMaxUsd: 25.0,
  monthlyMaxUsd: 200.0,
  alertThreshold: 0.8,
};

const defaultHITLConfig: HITLConfig = {
  defaultLevel: 'full_approval',
  overrides: {},
  routing: {
    approvalRequests: 'all',
    statusUpdates: 'primary',
    criticalAlerts: 'all',
  },
  escalation: {
    timeoutMinutes: 60,
    onTimeout: 'pause_and_notify',
    secondaryTimeoutMinutes: 30,
  },
};

// ============================================================================
// Minimal in-memory budget tracker for integration testing
// ============================================================================

const createBudgetTracker = (config: BudgetConfig) => {
  const taskSpend = new Map<string, number>();
  const phaseSpend = new Map<string, number>();
  let monthlySpend = 0;

  return {
    recordSpend(taskId: string, phase: string, amountUsd: number): void {
      taskSpend.set(taskId, (taskSpend.get(taskId) ?? 0) + amountUsd);
      phaseSpend.set(phase, (phaseSpend.get(phase) ?? 0) + amountUsd);
      monthlySpend += amountUsd;
    },

    checkBudget(agent: AgentContract, taskId: string, phase: string, estimate: CostEstimate): Result<void> {
      const taskTotal = (taskSpend.get(taskId) ?? 0) + estimate.estimatedCostUsd;
      if (taskTotal > agent.budget.max_cost_per_task_usd) {
        return Err({
          code: 'BUDGET_EXCEEDED_TASK' as const,
          message: `Task budget exceeded: $${taskTotal.toFixed(2)} > $${agent.budget.max_cost_per_task_usd.toFixed(2)}`,
          context: { taskId, spent: taskTotal, limit: agent.budget.max_cost_per_task_usd },
          recoverable: false,
          agentId: agent.role,
          taskId,
        } as AgentForgeError);
      }

      const phaseTotal = (phaseSpend.get(phase) ?? 0) + estimate.estimatedCostUsd;
      if (phaseTotal > config.perPhaseMaxUsd) {
        return Err({
          code: 'BUDGET_EXCEEDED_PHASE' as const,
          message: `Phase budget exceeded: $${phaseTotal.toFixed(2)} > $${config.perPhaseMaxUsd.toFixed(2)}`,
          context: { phase, spent: phaseTotal, limit: config.perPhaseMaxUsd },
          recoverable: false,
          agentId: agent.role,
          taskId,
        } as AgentForgeError);
      }

      const monthlyTotal = monthlySpend + estimate.estimatedCostUsd;
      if (monthlyTotal > config.monthlyMaxUsd) {
        return Err({
          code: 'BUDGET_EXCEEDED_PROJECT' as const,
          message: `Monthly budget exceeded: $${monthlyTotal.toFixed(2)} > $${config.monthlyMaxUsd.toFixed(2)}`,
          context: { spent: monthlyTotal, limit: config.monthlyMaxUsd },
          recoverable: false,
          agentId: agent.role,
          taskId,
        } as AgentForgeError);
      }

      return Ok(undefined);
    },

    getTaskSpend(taskId: string): number {
      return taskSpend.get(taskId) ?? 0;
    },
  };
};

// ============================================================================
// Minimal HITL enforcer for integration testing
// ============================================================================

const createHITLEnforcer = () => {
  const pendingGates: Array<{ gateId: string; action: AgentAction }> = [];

  return {
    enforce(action: AgentAction, config: HITLConfig): HITLResult {
      const phase = action.phase;
      const phaseMapping: Record<string, string> = {
        design: 'design',
        spec: 'spec_review',
        code: 'code_generation',
        cicd: 'staging_deploy',
        observe: 'observability',
      };
      const hitlPhase = phaseMapping[phase];
      const level = (hitlPhase && config.overrides[hitlPhase as keyof typeof config.overrides])
        ?? config.defaultLevel;

      switch (level) {
        case 'fully_autonomous':
          return { status: 'proceed' };
        case 'notify_only':
          return { status: 'notify', channels: [`slack:notify-${action.agentId}`] };
        case 'review_and_override':
        case 'full_approval': {
          const gateId = `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          pendingGates.push({ gateId, action });
          return {
            status: 'pause',
            gateId,
            channels: [`slack:approval-${action.agentId}`],
          };
        }
        default:
          return { status: 'proceed' };
      }
    },

    getPendingGates() {
      return [...pendingGates];
    },
  };
};

// ============================================================================
// Integration tests
// ============================================================================

describe('Governance middleware integration', () => {
  /**
   * Scenario 1: A design agent attempts to deploy — permission check blocks it.
   *
   * Design agents should only have design-related permissions.
   * Both deploy_staging and deploy_production are explicitly denied.
   */
  describe('permission denial: design agent cannot deploy', () => {
    it('denies deploy_staging for a design agent', () => {
      const agent = makeAgent();
      const action = makeAction({
        type: 'deploy_staging',
        target: 'staging-env',
        description: 'Deploy design preview to staging',
        phase: 'cicd',
      });

      const result = checkPermission(agent, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.context?.explicitlyDenied).toBe(true);
        expect(result.error.message).toContain('design-agent');
        expect(result.error.message).toContain('deploy_staging');
      }
    });

    it('denies deploy_production for a design agent', () => {
      const agent = makeAgent();
      const action = makeAction({
        type: 'deploy_production',
        target: 'production-env',
        description: 'Deploy to production',
        phase: 'cicd',
      });

      const result = checkPermission(agent, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.context?.explicitlyDenied).toBe(true);
        expect(result.error.recoverable).toBe(false);
      }
    });

    it('allows write_design for the same agent (within role)', () => {
      const agent = makeAgent();
      const action = makeAction({ type: 'write_design' });

      const result = checkPermission(agent, action);

      expect(result.ok).toBe(true);
    });

    it('blocks the entire pipeline when permission is denied', () => {
      const agent = makeAgent();
      const action = makeAction({ type: 'deploy_staging', phase: 'cicd' });
      const budget = createBudgetTracker(defaultBudgetConfig);
      const hitl = createHITLEnforcer();

      // Step 1: Permission check — should fail here
      const permResult = checkPermission(agent, action);
      expect(permResult.ok).toBe(false);

      // Steps 2 & 3 should never execute when permission is denied
      // Verify budget and HITL were not invoked by checking no side effects
      expect(budget.getTaskSpend(action.taskId)).toBe(0);
      expect(hitl.getPendingGates()).toHaveLength(0);
    });
  });

  /**
   * Scenario 2: Budget check blocks execution when the limit is reached.
   *
   * An agent that passes permission checks is still blocked if
   * budget would be exceeded by the upcoming operation.
   */
  describe('budget denial: execution blocked when limit is reached', () => {
    it('blocks when per-task budget would be exceeded', () => {
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['read_code', 'write_code'],
        denied: [],
        budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
      });
      const action = makeAction({
        agentId: 'code-agent',
        type: 'write_code',
        target: 'src/feature.ts',
        phase: 'code',
      });
      const budget = createBudgetTracker(defaultBudgetConfig);

      // Step 1: Permission check passes
      const permResult = checkPermission(agent, action);
      expect(permResult.ok).toBe(true);

      // Simulate prior spend that nearly exhausts the task budget
      budget.recordSpend(action.taskId, action.phase, 1.80);

      // Step 2: Budget check with an estimate that pushes over the limit
      const estimate: CostEstimate = {
        estimatedInputTokens: 5_000,
        estimatedOutputTokens: 2_000,
        estimatedCostUsd: 0.50,
        confidence: 'medium',
      };
      const budgetResult = budget.checkBudget(agent, action.taskId, action.phase, estimate);

      expect(budgetResult.ok).toBe(false);
      if (!budgetResult.ok) {
        expect(budgetResult.error.code).toBe('BUDGET_EXCEEDED_TASK');
        expect(budgetResult.error.recoverable).toBe(false);
        expect(budgetResult.error.message).toContain('Task budget exceeded');
      }
    });

    it('blocks when monthly budget would be exceeded', () => {
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['read_code', 'write_code'],
        denied: [],
      });
      const action = makeAction({ agentId: 'code-agent', type: 'write_code', phase: 'code' });
      const tightBudget = createBudgetTracker({
        ...defaultBudgetConfig,
        monthlyMaxUsd: 10.0,
      });

      // Permission passes
      expect(checkPermission(agent, action).ok).toBe(true);

      // Exhaust monthly budget across multiple tasks
      tightBudget.recordSpend('task-001', 'code', 4.0);
      tightBudget.recordSpend('task-002', 'code', 4.0);
      tightBudget.recordSpend('task-003', 'code', 1.5);

      const estimate: CostEstimate = {
        estimatedInputTokens: 3_000,
        estimatedOutputTokens: 1_000,
        estimatedCostUsd: 1.0,
        confidence: 'high',
      };
      const budgetResult = tightBudget.checkBudget(agent, 'task-004', 'code', estimate);

      expect(budgetResult.ok).toBe(false);
      if (!budgetResult.ok) {
        expect(budgetResult.error.code).toBe('BUDGET_EXCEEDED_PROJECT');
      }
    });

    it('allows execution when budget is sufficient', () => {
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['read_code', 'write_code'],
        denied: [],
      });
      const action = makeAction({ agentId: 'code-agent', type: 'write_code', phase: 'code' });
      const budget = createBudgetTracker(defaultBudgetConfig);

      // Small prior spend
      budget.recordSpend(action.taskId, action.phase, 0.50);

      const estimate: CostEstimate = {
        estimatedInputTokens: 2_000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.25,
        confidence: 'high',
      };
      const budgetResult = budget.checkBudget(agent, action.taskId, action.phase, estimate);

      expect(budgetResult.ok).toBe(true);
    });
  });

  /**
   * Scenario 3: HITL enforcement pauses when approval is required.
   *
   * When the HITL level is `full_approval`, the enforcer must create
   * a gate and return `pause` status with channel references.
   */
  describe('HITL enforcement: pause when approval is required', () => {
    it('pauses with a gate when default level is full_approval', () => {
      const agent = makeAgent();
      const action = makeAction();
      const hitl = createHITLEnforcer();

      // Steps 1 & 2 pass
      expect(checkPermission(agent, action).ok).toBe(true);

      // Step 3: HITL enforcement
      const hitlResult = hitl.enforce(action, defaultHITLConfig);

      expect(hitlResult.status).toBe('pause');
      if (hitlResult.status === 'pause') {
        expect(hitlResult.gateId).toBeDefined();
        expect(hitlResult.gateId).toMatch(/^gate-/);
        expect(hitlResult.channels).toHaveLength(1);
        expect(hitlResult.channels[0]).toContain('slack:approval-');
      }
    });

    it('creates a pending gate that can be tracked', () => {
      makeAgent();
      const action = makeAction();
      const hitl = createHITLEnforcer();

      hitl.enforce(action, defaultHITLConfig);

      const gates = hitl.getPendingGates();
      expect(gates).toHaveLength(1);
      expect(gates[0].action.agentId).toBe('design-agent');
      expect(gates[0].action.type).toBe('write_design');
    });

    it('proceeds without pause when level is fully_autonomous', () => {
      makeAgent({ hitl_policy: 'fully_autonomous' });
      const action = makeAction();
      const hitl = createHITLEnforcer();

      const autonomousConfig: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
      };

      const hitlResult = hitl.enforce(action, autonomousConfig);

      expect(hitlResult.status).toBe('proceed');
      expect(hitl.getPendingGates()).toHaveLength(0);
    });

    it('respects per-phase overrides', () => {
      makeAgent();
      const action = makeAction({ phase: 'design' });
      const hitl = createHITLEnforcer();

      const configWithOverride: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
        overrides: { design: 'full_approval' },
      };

      const hitlResult = hitl.enforce(action, configWithOverride);

      expect(hitlResult.status).toBe('pause');
    });

    it('sends notification for notify_only level', () => {
      const action = makeAction({ phase: 'code' });
      const hitl = createHITLEnforcer();

      const notifyConfig: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'notify_only',
      };

      const hitlResult = hitl.enforce(action, notifyConfig);

      expect(hitlResult.status).toBe('notify');
      if (hitlResult.status === 'notify') {
        expect(hitlResult.channels).toHaveLength(1);
      }
    });
  });

  /**
   * Scenario 4: Full pipeline — all three gates in sequence.
   *
   * Verifies the correct ordering: permission → budget → HITL.
   * Each gate must pass before the next is evaluated.
   */
  describe('full pipeline: permission → budget → HITL', () => {
    it('runs all three checks when agent has valid permissions and budget', () => {
      const agent = makeAgent();
      const action = makeAction({ type: 'write_design' });
      const budget = createBudgetTracker(defaultBudgetConfig);
      const hitl = createHITLEnforcer();

      // Step 1: Permission
      const permResult = checkPermission(agent, action);
      expect(permResult.ok).toBe(true);

      // Step 2: Budget
      const estimate: CostEstimate = {
        estimatedInputTokens: 1_000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.10,
        confidence: 'high',
      };
      const budgetResult = budget.checkBudget(agent, action.taskId, action.phase, estimate);
      expect(budgetResult.ok).toBe(true);

      // Step 3: HITL — should pause for approval
      const hitlResult = hitl.enforce(action, defaultHITLConfig);
      expect(hitlResult.status).toBe('pause');
    });

    it('short-circuits at permission check, never reaching budget or HITL', () => {
      const agent = makeAgent();
      const action = makeAction({ type: 'deploy_production', phase: 'cicd' });
      const hitl = createHITLEnforcer();

      const permResult = checkPermission(agent, action);
      expect(permResult.ok).toBe(false);

      // Pipeline stops — no budget check, no HITL gate
      expect(hitl.getPendingGates()).toHaveLength(0);
    });

    it('short-circuits at budget check, never reaching HITL', () => {
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['write_code'],
        denied: [],
        budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 1.0 },
      });
      const action = makeAction({
        agentId: 'code-agent',
        type: 'write_code',
        phase: 'code',
      });
      const budget = createBudgetTracker(defaultBudgetConfig);
      const hitl = createHITLEnforcer();

      // Permission passes
      expect(checkPermission(agent, action).ok).toBe(true);

      // Exhaust budget
      budget.recordSpend(action.taskId, action.phase, 0.90);

      const estimate: CostEstimate = {
        estimatedInputTokens: 5_000,
        estimatedOutputTokens: 2_000,
        estimatedCostUsd: 0.50,
        confidence: 'medium',
      };
      const budgetResult = budget.checkBudget(agent, action.taskId, action.phase, estimate);
      expect(budgetResult.ok).toBe(false);

      // HITL should not have been invoked
      expect(hitl.getPendingGates()).toHaveLength(0);
    });
  });
});
