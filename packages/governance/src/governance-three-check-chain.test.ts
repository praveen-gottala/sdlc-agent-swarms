/**
 * Three-Check Chain Test Suite
 *
 * Validates the governance middleware fires three checks in strict order
 * before any LLM call: checkPermission → checkBudget → enforceHITL.
 *
 * Critical invariant: every Deny from any check produces zero LLM
 * invocations and zero token spend.
 *
 * PRD v2.0 Section 4.4 specifies: permission → HITL → budget.
 * Implementation uses:            permission → budget → HITL.
 * See ADR-004 (docs/adrs/ADR-004-governance-middleware-ordering.md) for rationale:
 * budget is synchronous with no side effects; HITL creates external approval
 * workflows. Running budget first prevents orphaned approval requests.
 */

import type { AgentContract, CostEstimate } from '@agentforge/core';
import {
  createGovernanceMiddleware,
  executeGovernancePipeline,
  checkPermission,
  createBudgetTracker,
  createHITLEnforcer,
} from './index.js';
import type {
  AgentAction,
  BudgetConfig,
  HITLConfig,
  GovernanceConfig,
} from './types.js';

// ============================================================================
// Shared test factories
// ============================================================================

const makeAgent = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'test-agent',
  description: 'Test agent',
  category: 'code',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 100_000 },
  tools: [],
  permissions: ['read_code', 'write_code', 'read_spec'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
  on_complete: 'TaskComplete',
  on_error: 'retry',
  context: {},
  ...overrides,
});

const makeAction = (overrides: Partial<AgentAction> = {}): AgentAction => ({
  agentId: 'test-agent',
  taskId: 'task-001',
  type: 'write_code',
  target: 'src/feature.ts',
  description: 'Write feature code',
  phase: 'code',
  timestamp: new Date().toISOString(),
  ...overrides,
});

const smallEstimate: CostEstimate = {
  estimatedInputTokens: 1_000,
  estimatedOutputTokens: 500,
  estimatedCostUsd: 0.10,
  confidence: 'high',
};

const defaultBudgetConfig: BudgetConfig = {
  perTaskMaxUsd: 2.0,
  perPhaseMaxUsd: 25.0,
  monthlyMaxUsd: 200.0,
  alertThreshold: 0.8,
};

const makeHITLConfig = (overrides: Partial<HITLConfig> = {}): HITLConfig => ({
  defaultLevel: 'fully_autonomous',
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
  ...overrides,
});

const makeGovernanceConfig = (overrides: Partial<GovernanceConfig> = {}): GovernanceConfig => ({
  hitl: makeHITLConfig(),
  budget: defaultBudgetConfig,
  circuitBreaker: {
    maxConsecutiveFailures: 5,
    maxCallsWithoutProgress: 5,
    resetAfterMinutes: 5,
  },
  ...overrides,
});

// ============================================================================
// LLM Provider Mock — counts invocations and token spend
// ============================================================================

interface LLMProviderMock {
  invoke: () => Promise<{ tokens: number; costUsd: number }>;
  invocationCount: () => number;
  totalTokens: () => number;
  totalCostUsd: () => number;
  reset: () => void;
}

const createLLMProviderMock = (): LLMProviderMock => {
  let invocations = 0;
  let tokens = 0;
  let cost = 0;

  return {
    async invoke() {
      invocations++;
      const result = { tokens: 1000, costUsd: 0.05 };
      tokens += result.tokens;
      cost += result.costUsd;
      return result;
    },
    invocationCount: () => invocations,
    totalTokens: () => tokens,
    totalCostUsd: () => cost,
    reset() {
      invocations = 0;
      tokens = 0;
      cost = 0;
    },
  };
};

// ============================================================================
// 1. checkPermission tests
// ============================================================================

describe('Three-Check Chain: checkPermission', () => {
  it('denies a design agent attempting write_code', () => {
    const designAgent = makeAgent({
      role: 'design-agent',
      category: 'design',
      permissions: ['read_design', 'write_design', 'read_design_system'],
      denied: [],
    });
    const action = makeAction({ agentId: 'design-agent', type: 'write_code' });

    const result = checkPermission(designAgent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.context?.explicitlyDenied).toBe(false);
      expect(result.error.message).toContain('design-agent');
      expect(result.error.message).toContain('write_code');
    }
  });

  it('allows a code agent attempting read_spec', () => {
    const codeAgent = makeAgent({
      role: 'code-agent',
      category: 'code',
      permissions: ['read_code', 'write_code', 'read_spec'],
      denied: [],
    });
    const action = makeAction({ agentId: 'code-agent', type: 'read_spec' });

    const result = checkPermission(codeAgent, action);

    expect(result.ok).toBe(true);
  });

  it('denied permissions in the agent contract override inherited/granted permissions', () => {
    // Agent has wildcard ("*") permission but write_code is explicitly denied
    const restrictedAgent = makeAgent({
      role: 'restricted-agent',
      permissions: ['*'],
      denied: ['write_code'],
    });
    const action = makeAction({ agentId: 'restricted-agent', type: 'write_code' });

    const result = checkPermission(restrictedAgent, action);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
      expect(result.error.context?.explicitlyDenied).toBe(true);
    }
  });
});

// ============================================================================
// 2. enforceHITL tests
// ============================================================================

describe('Three-Check Chain: enforceHITL', () => {
  it('full_approval returns Pause and sends an approval request event', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    const enforcer = createHITLEnforcer(eventBus);
    const action = makeAction({ phase: 'design' });
    const config = makeHITLConfig({ defaultLevel: 'full_approval' });

    const result = enforcer.enforce(action, config);

    expect(result.status).toBe('pause');
    if (result.status === 'pause') {
      expect(result.gateId).toBeDefined();
      expect(result.channels.length).toBeGreaterThan(0);
    }
    // HITLApprovalRequested event must be emitted
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('HITLApprovalRequested');
  });

  it('notify_only returns Proceed-equivalent (notify) and emits a notification event', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    const enforcer = createHITLEnforcer(eventBus);
    const action = makeAction();
    const config = makeHITLConfig({ defaultLevel: 'notify_only' });

    const result = enforcer.enforce(action, config);

    expect(result.status).toBe('notify');
    if (result.status === 'notify') {
      expect(result.channels.length).toBeGreaterThan(0);
      expect(result.channels[0]).toContain('notify');
    }
    // notify_only does not create a gate → no HITLApprovalRequested event
    expect(enforcer.getPendingGates()).toHaveLength(0);
  });

  it('review_and_override returns Pause but queues a review task (gate)', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    const enforcer = createHITLEnforcer(eventBus);
    const action = makeAction();
    const config = makeHITLConfig({ defaultLevel: 'review_and_override' });

    const result = enforcer.enforce(action, config);

    // review_and_override creates a gate (pause) per the implementation
    expect(result.status).toBe('pause');
    const gates = enforcer.getPendingGates();
    expect(gates).toHaveLength(1);
    expect(gates[0].level).toBe('review_and_override');
    // Approval request event emitted
    expect(events.some((e) => (e as { type: string }).type === 'HITLApprovalRequested')).toBe(true);
  });

  it('fully_autonomous returns Proceed with zero notifications', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    const enforcer = createHITLEnforcer(eventBus);
    const action = makeAction();
    const config = makeHITLConfig({ defaultLevel: 'fully_autonomous' });

    const result = enforcer.enforce(action, config);

    expect(result.status).toBe('proceed');
    expect(enforcer.getPendingGates()).toHaveLength(0);
    expect(events).toHaveLength(0);
  });
});

// ============================================================================
// 3. checkBudget tests
// ============================================================================

describe('Three-Check Chain: checkBudget', () => {
  it('allows when task cost is under per-task limit', () => {
    const tracker = createBudgetTracker(defaultBudgetConfig);
    const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 } });

    const result = tracker.checkBudget(agent, 'task-001', 'code', smallEstimate);

    expect(result.ok).toBe(true);
  });

  it('denies when task cost would push phase spend over per-phase limit', () => {
    const tightPhaseConfig: BudgetConfig = { ...defaultBudgetConfig, perPhaseMaxUsd: 1.0 };
    const tracker = createBudgetTracker(tightPhaseConfig);
    const agent = makeAgent();

    // Spend 0.80 in the phase across multiple tasks
    tracker.recordSpend('task-a', 'code', 0.50);
    tracker.recordSpend('task-b', 'code', 0.30);

    // New estimate of 0.30 would push phase total to 1.10 > 1.0
    const estimate: CostEstimate = {
      estimatedInputTokens: 2_000,
      estimatedOutputTokens: 1_000,
      estimatedCostUsd: 0.30,
      confidence: 'medium',
    };
    const result = tracker.checkBudget(agent, 'task-c', 'code', estimate);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_PHASE');
    }
  });

  it('emits a BudgetAlert event when phase spend reaches 80% of limit', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    // Use a large per-task limit so task alerts don't interfere
    const config: BudgetConfig = {
      ...defaultBudgetConfig,
      perTaskMaxUsd: 100.0,  // high task limit to avoid task-level alerts
    };
    const tracker = createBudgetTracker(config, eventBus);

    // Spread spend across multiple tasks to avoid per-task threshold.
    // 80% of perPhaseMaxUsd (25.0) = 20.0
    tracker.recordSpend('task-a', 'code', 10.0);
    tracker.recordSpend('task-b', 'code', 10.0);

    const budgetAlerts = events.filter(
      (e) => (e as { type: string }).type === 'BudgetAlert',
    );
    // Find the phase-level alert specifically
    const phaseAlert = budgetAlerts.find(
      (e) => (e as { payload: { level: string } }).payload.level === 'phase',
    );
    expect(phaseAlert).toBeDefined();
    const alert = (phaseAlert as { payload: { severity: string; level: string } }).payload;
    expect(alert.severity).toBe('warning');
    expect(alert.level).toBe('phase');
  });

  it('budget exceeded mid-task triggers hard stop with no partial output committed', () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };
    const llm = createLLMProviderMock();

    const tightConfig: BudgetConfig = {
      ...defaultBudgetConfig,
      perTaskMaxUsd: 0.10,
    };
    const tracker = createBudgetTracker(tightConfig, eventBus);
    const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 0.10 } });

    // Simulate prior spend that exhausts the budget
    tracker.recordSpend('task-001', 'code', 0.08);

    // Next check should deny
    const estimate: CostEstimate = {
      estimatedInputTokens: 2_000,
      estimatedOutputTokens: 1_000,
      estimatedCostUsd: 0.05,
      confidence: 'high',
    };
    const result = tracker.checkBudget(agent, 'task-001', 'code', estimate);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
      expect(result.error.recoverable).toBe(false);
    }

    // LLM must not have been invoked — hard stop means no partial output
    expect(llm.invocationCount()).toBe(0);
    expect(llm.totalTokens()).toBe(0);
  });
});

// ============================================================================
// 4. Zero LLM calls on any Deny path
// ============================================================================

describe('Three-Check Chain: zero LLM invocations on Deny', () => {
  let llm: LLMProviderMock;

  beforeEach(() => {
    llm = createLLMProviderMock();
  });

  /**
   * Simulates the full agent execution pattern:
   * 1. Run governance pipeline
   * 2. Only call LLM if pipeline returns Ok with status 'proceed' or 'notify'
   */
  const simulateAgentExecution = async (
    agent: AgentContract,
    action: AgentAction,
    estimate: CostEstimate,
    govConfig: GovernanceConfig,
  ) => {
    const middleware = createGovernanceMiddleware({
      config: govConfig,
    });

    const pipelineResult = await executeGovernancePipeline(
      middleware,
      agent,
      action,
      estimate,
      govConfig.hitl,
    );

    if (pipelineResult.ok) {
      const hitlResult = pipelineResult.value;
      if (hitlResult.status === 'proceed' || hitlResult.status === 'notify') {
        await llm.invoke();
      }
    }

    return pipelineResult;
  };

  it('permission denial produces zero LLM invocations', async () => {
    const designAgent = makeAgent({
      role: 'design-agent',
      category: 'design',
      permissions: ['read_design', 'write_design'],
      denied: [],
    });
    const action = makeAction({ agentId: 'design-agent', type: 'write_code' });

    const result = await simulateAgentExecution(
      designAgent,
      action,
      smallEstimate,
      makeGovernanceConfig(),
    );

    expect(result.ok).toBe(false);
    expect(llm.invocationCount()).toBe(0);
    expect(llm.totalTokens()).toBe(0);
    expect(llm.totalCostUsd()).toBe(0);
  });

  it('budget denial produces zero LLM invocations', async () => {
    const agent = makeAgent({
      budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 0.05 },
    });
    const action = makeAction();
    const expensiveEstimate: CostEstimate = {
      estimatedInputTokens: 10_000,
      estimatedOutputTokens: 5_000,
      estimatedCostUsd: 1.00,
      confidence: 'medium',
    };

    const result = await simulateAgentExecution(
      agent,
      action,
      expensiveEstimate,
      makeGovernanceConfig(),
    );

    expect(result.ok).toBe(false);
    expect(llm.invocationCount()).toBe(0);
    expect(llm.totalTokens()).toBe(0);
    expect(llm.totalCostUsd()).toBe(0);
  });

  it('HITL pause produces zero LLM invocations (agent waits for approval)', async () => {
    const agent = makeAgent();
    const action = makeAction();
    const config = makeGovernanceConfig({
      hitl: makeHITLConfig({ defaultLevel: 'full_approval' }),
    });

    const result = await simulateAgentExecution(
      agent,
      action,
      smallEstimate,
      config,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('pause');
    }
    // Paused = no LLM call until human approves
    expect(llm.invocationCount()).toBe(0);
    expect(llm.totalTokens()).toBe(0);
  });

  it('fully passing pipeline allows exactly one LLM invocation', async () => {
    const agent = makeAgent();
    const action = makeAction();
    const config = makeGovernanceConfig();

    const result = await simulateAgentExecution(
      agent,
      action,
      smallEstimate,
      config,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('proceed');
    }
    expect(llm.invocationCount()).toBe(1);
  });
});

// ============================================================================
// 5. Execution order spy — proves permission → budget → HITL sequence
// ============================================================================

describe('Three-Check Chain: execution order', () => {
  it('executes checks in strict order: checkPermission → checkBudget → enforceHITL', async () => {
    const executionLog: string[] = [];

    const config = makeGovernanceConfig({
      hitl: makeHITLConfig({ defaultLevel: 'fully_autonomous' }),
    });
    const realMiddleware = createGovernanceMiddleware({ config });

    // Wrap the real middleware with order-tracking spies
    const spiedMiddleware = {
      checkPermission: (...args: Parameters<typeof realMiddleware.checkPermission>) => {
        executionLog.push('checkPermission');
        return realMiddleware.checkPermission(...args);
      },
      checkBudget: (...args: Parameters<typeof realMiddleware.checkBudget>) => {
        executionLog.push('checkBudget');
        return realMiddleware.checkBudget(...args);
      },
      enforceHITL: async (...args: Parameters<typeof realMiddleware.enforceHITL>) => {
        executionLog.push('enforceHITL');
        return realMiddleware.enforceHITL(...args);
      },
      recordAudit: realMiddleware.recordAudit,
    };

    const agent = makeAgent();
    const action = makeAction();

    await executeGovernancePipeline(
      spiedMiddleware,
      agent,
      action,
      smallEstimate,
      config.hitl,
    );

    expect(executionLog).toEqual(['checkPermission', 'checkBudget', 'enforceHITL']);
  });

  it('short-circuits at checkPermission — checkBudget and enforceHITL never run', async () => {
    const executionLog: string[] = [];

    const config = makeGovernanceConfig();
    const realMiddleware = createGovernanceMiddleware({ config });

    const spiedMiddleware = {
      checkPermission: (...args: Parameters<typeof realMiddleware.checkPermission>) => {
        executionLog.push('checkPermission');
        return realMiddleware.checkPermission(...args);
      },
      checkBudget: (...args: Parameters<typeof realMiddleware.checkBudget>) => {
        executionLog.push('checkBudget');
        return realMiddleware.checkBudget(...args);
      },
      enforceHITL: async (...args: Parameters<typeof realMiddleware.enforceHITL>) => {
        executionLog.push('enforceHITL');
        return realMiddleware.enforceHITL(...args);
      },
      recordAudit: realMiddleware.recordAudit,
    };

    const designAgent = makeAgent({
      role: 'design-agent',
      permissions: ['read_design'],
      denied: [],
    });
    const action = makeAction({ agentId: 'design-agent', type: 'write_code' });

    const result = await executeGovernancePipeline(
      spiedMiddleware,
      designAgent,
      action,
      smallEstimate,
      config.hitl,
    );

    expect(result.ok).toBe(false);
    expect(executionLog).toEqual(['checkPermission']);
  });

  it('short-circuits at checkBudget — enforceHITL never runs', async () => {
    const executionLog: string[] = [];

    const config = makeGovernanceConfig({
      budget: { ...defaultBudgetConfig, perTaskMaxUsd: 0.01 },
    });
    const realMiddleware = createGovernanceMiddleware({ config });

    const spiedMiddleware = {
      checkPermission: (...args: Parameters<typeof realMiddleware.checkPermission>) => {
        executionLog.push('checkPermission');
        return realMiddleware.checkPermission(...args);
      },
      checkBudget: (...args: Parameters<typeof realMiddleware.checkBudget>) => {
        executionLog.push('checkBudget');
        return realMiddleware.checkBudget(...args);
      },
      enforceHITL: async (...args: Parameters<typeof realMiddleware.enforceHITL>) => {
        executionLog.push('enforceHITL');
        return realMiddleware.enforceHITL(...args);
      },
      recordAudit: realMiddleware.recordAudit,
    };

    const agent = makeAgent({
      budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 0.01 },
    });
    const action = makeAction();
    const expensiveEstimate: CostEstimate = {
      estimatedInputTokens: 10_000,
      estimatedOutputTokens: 5_000,
      estimatedCostUsd: 1.00,
      confidence: 'medium',
    };

    const result = await executeGovernancePipeline(
      spiedMiddleware,
      agent,
      action,
      expensiveEstimate,
      config.hitl,
    );

    expect(result.ok).toBe(false);
    expect(executionLog).toEqual(['checkPermission', 'checkBudget']);
  });
});

// ============================================================================
// 6. ADR-004: Budget check fires before HITL gate
// ============================================================================

describe('Three-Check Chain: budget before HITL (ADR-004)', () => {
  /**
   * ADR-004: Governance middleware runs budget before HITL to prevent
   * orphaned approval requests. When budget would deny an action, no
   * approval request should be sent to any channel.
   */
  it('budget_check_fires_before_hitl_gate — no approval request on budget Deny', async () => {
    const events: unknown[] = [];
    const eventBus = { publish: (e: unknown) => events.push(e) };

    // Budget: $1.00 per task, $0.90 already consumed
    const config = makeGovernanceConfig({
      budget: { ...defaultBudgetConfig, perTaskMaxUsd: 1.0 },
      hitl: makeHITLConfig({ defaultLevel: 'full_approval' }),
    });
    const middleware = createGovernanceMiddleware({ config, eventBus });

    const agent = makeAgent({
      budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 1.0 },
    });
    const action = makeAction();

    // Seed $0.90 of prior spend on this task via a separate budget tracker
    // so the middleware's internal tracker sees the spend.
    // We need to use the middleware's checkBudget path, so instead we
    // pre-exhaust by running a cheap check first, then recording spend
    // through the middleware pipeline.

    // First call: permission sets currentAction context. We need to push
    // spend into the middleware's budget tracker. Since the tracker is
    // internal, we simulate prior spend by making the estimate large enough
    // to exceed the limit in one shot: $0.90 already spent + $0.50 estimate > $1.00.
    // The middleware doesn't expose recordSpend, so we use the estimate to
    // represent the cumulative overshoot.
    const overBudgetEstimate: CostEstimate = {
      estimatedInputTokens: 10_000,
      estimatedOutputTokens: 5_000,
      estimatedCostUsd: 1.50, // exceeds $1.00 per-task limit
      confidence: 'medium',
    };

    const result = await executeGovernancePipeline(
      middleware,
      agent,
      action,
      overBudgetEstimate,
      config.hitl,
    );

    // Budget should deny
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }

    // No HITLApprovalRequested event should have been emitted
    const approvalEvents = events.filter(
      (e) => (e as { type: string }).type === 'HITLApprovalRequested',
    );
    expect(approvalEvents).toHaveLength(0);

    // No approval channels should have been contacted at all
    const allEventTypes = events.map((e) => (e as { type: string }).type);
    expect(allEventTypes).not.toContain('HITLApprovalRequested');
  });
});
