/**
 * Unit tests for the governance middleware.
 *
 * Tests delegation to each sub-component and the executeGovernancePipeline
 * convenience function that orchestrates the full permission -> budget -> HITL flow.
 */

import type {
  AgentContract,
  CostEstimate,
} from '@agentforge/core';
import { createGovernanceMiddleware, executeGovernancePipeline } from './governance-middleware.js';
import type {
  AgentAction,
  BudgetConfig,
  GovernanceConfig,
  HITLConfig,
  AuditEntry,
  AuditOutcome,
  GovernanceCheckRecord,
} from './types.js';

// ============================================================================
// Test helpers (consistent with integration test)
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

const defaultGovernanceConfig: GovernanceConfig = {
  hitl: defaultHITLConfig,
  budget: defaultBudgetConfig,
  circuitBreaker: {
    maxConsecutiveFailures: 5,
    maxCallsWithoutProgress: 5,
    resetAfterMinutes: 5,
  },
};

const makeEstimate = (overrides: Partial<CostEstimate> = {}): CostEstimate => ({
  estimatedInputTokens: 1_000,
  estimatedOutputTokens: 500,
  estimatedCostUsd: 0.10,
  confidence: 'high',
  ...overrides,
});

const makeAuditEntry = (overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 'audit-001',
  timestamp: '2026-03-17T10:00:00Z',
  agentId: 'design-agent',
  taskId: 'task-design-001',
  phase: 'design',
  action: makeAction(),
  outcome: 'success' as AuditOutcome,
  governanceChecks: {
    permissionGranted: true,
    budgetApproved: true,
    hitlResult: 'proceed',
  } as GovernanceCheckRecord,
  ...overrides,
});

// ============================================================================
// Tests
// ============================================================================

describe('GovernanceMiddleware', () => {
  const createMiddleware = (configOverrides: Partial<GovernanceConfig> = {}) =>
    createGovernanceMiddleware({
      config: { ...defaultGovernanceConfig, ...configOverrides },
    });

  describe('checkPermission', () => {
    it('delegates to permission-checker and allows valid actions', () => {
      const middleware = createMiddleware();
      const agent = makeAgent();
      const action = makeAction({ type: 'write_design' });

      const result = middleware.checkPermission(agent, action);

      expect(result.ok).toBe(true);
    });

    it('delegates to permission-checker and denies invalid actions', () => {
      const middleware = createMiddleware();
      const agent = makeAgent();
      const action = makeAction({ type: 'deploy_staging', phase: 'cicd' });

      const result = middleware.checkPermission(agent, action);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
        expect(result.error.context?.explicitlyDenied).toBe(true);
      }
    });
  });

  describe('checkBudget', () => {
    it('uses action context from prior checkPermission call', () => {
      const middleware = createMiddleware();
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['write_code'],
        denied: [],
        budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
      });
      const action = makeAction({
        agentId: 'code-agent',
        taskId: 'task-code-001',
        type: 'write_code',
        phase: 'code',
      });

      // checkPermission sets the action context
      middleware.checkPermission(agent, action);

      const estimate = makeEstimate({ estimatedCostUsd: 0.50 });
      const result = middleware.checkBudget(agent, estimate);

      expect(result.ok).toBe(true);
    });

    it('works with default context when no prior checkPermission', () => {
      const middleware = createMiddleware();
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['write_code'],
        denied: [],
      });

      // No checkPermission call — should use defaults (taskId='unknown', phase='code')
      const estimate = makeEstimate({ estimatedCostUsd: 0.10 });
      const result = middleware.checkBudget(agent, estimate);

      expect(result.ok).toBe(true);
    });

    it('denies when budget would be exceeded', () => {
      const tightConfig: GovernanceConfig = {
        ...defaultGovernanceConfig,
        budget: { ...defaultBudgetConfig, monthlyMaxUsd: 0.05 },
      };
      const middleware = createMiddleware(tightConfig);
      const agent = makeAgent({
        role: 'code-agent',
        category: 'code',
        permissions: ['write_code'],
        denied: [],
      });
      const action = makeAction({
        agentId: 'code-agent',
        type: 'write_code',
        phase: 'code',
      });

      middleware.checkPermission(agent, action);

      const estimate = makeEstimate({ estimatedCostUsd: 1.0 });
      const result = middleware.checkBudget(agent, estimate);

      expect(result.ok).toBe(false);
    });
  });

  describe('enforceHITL', () => {
    it('delegates to hitl-enforcer', async () => {
      const middleware = createMiddleware();
      const action = makeAction();

      const result = await middleware.enforceHITL(action, defaultHITLConfig);

      // default level is full_approval → pause
      expect(result.status).toBe('pause');
      if (result.status === 'pause') {
        expect(result.gateId).toMatch(/^gate-/);
        expect(result.channels).toHaveLength(1);
      }
    });

    it('returns proceed for fully_autonomous level', async () => {
      const middleware = createMiddleware();
      const action = makeAction();
      const autonomousConfig: HITLConfig = {
        ...defaultHITLConfig,
        defaultLevel: 'fully_autonomous',
      };

      const result = await middleware.enforceHITL(action, autonomousConfig);

      expect(result.status).toBe('proceed');
    });
  });

  describe('recordAudit', () => {
    it('delegates to audit-logger (fire-and-forget)', () => {
      const middleware = createMiddleware();
      const entry = makeAuditEntry();

      // Should not throw
      expect(() => middleware.recordAudit(entry)).not.toThrow();
    });
  });
});

describe('executeGovernancePipeline', () => {
  const createMiddleware = (configOverrides: Partial<GovernanceConfig> = {}) =>
    createGovernanceMiddleware({
      config: { ...defaultGovernanceConfig, ...configOverrides },
    });

  it('runs all three checks in order and returns HITL result', async () => {
    const middleware = createMiddleware();
    const agent = makeAgent();
    const action = makeAction({ type: 'write_design' });
    const estimate = makeEstimate();
    const autonomousConfig: HITLConfig = {
      ...defaultHITLConfig,
      defaultLevel: 'fully_autonomous',
    };

    const result = await executeGovernancePipeline(
      middleware, agent, action, estimate, autonomousConfig,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('proceed');
    }
  });

  it('short-circuits on permission denial', async () => {
    const middleware = createMiddleware();
    const agent = makeAgent();
    const action = makeAction({ type: 'deploy_staging', phase: 'cicd' });
    const estimate = makeEstimate();

    const result = await executeGovernancePipeline(
      middleware, agent, action, estimate, defaultHITLConfig,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('PERMISSION_DENIED');
    }
  });

  it('short-circuits on budget denial', async () => {
    const tightConfig: GovernanceConfig = {
      ...defaultGovernanceConfig,
      budget: { ...defaultBudgetConfig, monthlyMaxUsd: 0.01 },
    };
    const middleware = createMiddleware(tightConfig);
    const agent = makeAgent({
      role: 'code-agent',
      category: 'code',
      permissions: ['write_code'],
      denied: [],
    });
    const action = makeAction({
      agentId: 'code-agent',
      type: 'write_code',
      phase: 'code',
    });
    const estimate = makeEstimate({ estimatedCostUsd: 1.0 });

    const result = await executeGovernancePipeline(
      middleware, agent, action, estimate, defaultHITLConfig,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toMatch(/^BUDGET_EXCEEDED/);
    }
  });

  it('reaches HITL when permission and budget pass', async () => {
    const middleware = createMiddleware();
    const agent = makeAgent();
    const action = makeAction({ type: 'write_design' });
    const estimate = makeEstimate();

    const result = await executeGovernancePipeline(
      middleware, agent, action, estimate, defaultHITLConfig,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // default level is full_approval → pause
      expect(result.value.status).toBe('pause');
    }
  });
});
