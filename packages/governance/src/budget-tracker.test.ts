/**
 * Unit tests for the budget tracker module.
 */

import type { AgentContract, CostEstimate } from '@agentforge/core';
import { createBudgetTracker } from './budget-tracker.js';
import type { BudgetConfig } from './types.js';

const makeAgent = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'code-agent',
  description: 'A code agent',
  category: 'code',
  provider: 'anthropic:claude-sonnet',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 100_000 },
  tools: [],
  permissions: ['read_code', 'write_code'],
  denied: [],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 2.0 },
  on_complete: 'CodeComplete',
  on_error: 'CodeFailed',
  context: {},
  ...overrides,
});

const defaultConfig: BudgetConfig = {
  perTaskMaxUsd: 2.0,
  perPhaseMaxUsd: 25.0,
  monthlyMaxUsd: 200.0,
  alertThreshold: 0.8,
};

const makeEstimate = (costUsd: number): CostEstimate => ({
  estimatedInputTokens: 1_000,
  estimatedOutputTokens: 500,
  estimatedCostUsd: costUsd,
  confidence: 'medium',
});

describe('BudgetTracker', () => {
  describe('checkBudget', () => {
    it('allows when within task budget', () => {
      const tracker = createBudgetTracker(defaultConfig);
      const agent = makeAgent();

      tracker.recordSpend('task-1', 'code', 0.50);
      const result = tracker.checkBudget(agent, 'task-1', 'code', makeEstimate(0.25));

      expect(result.ok).toBe(true);
    });

    it('denies when task budget would be exceeded', () => {
      const tracker = createBudgetTracker(defaultConfig);
      const agent = makeAgent();

      tracker.recordSpend('task-1', 'code', 1.80);
      const result = tracker.checkBudget(agent, 'task-1', 'code', makeEstimate(0.50));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
        expect(result.error.message).toContain('Task budget exceeded');
        expect(result.error.recoverable).toBe(false);
        expect(result.error.agentId).toBe('code-agent');
        expect(result.error.taskId).toBe('task-1');
      }
    });

    it('denies when phase budget would be exceeded', () => {
      const tracker = createBudgetTracker({
        ...defaultConfig,
        perPhaseMaxUsd: 5.0,
      });
      const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 10.0 } });

      tracker.recordSpend('task-1', 'code', 2.0);
      tracker.recordSpend('task-2', 'code', 2.5);
      const result = tracker.checkBudget(agent, 'task-3', 'code', makeEstimate(1.0));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_PHASE');
        expect(result.error.message).toContain('Phase budget exceeded');
      }
    });

    it('denies when monthly budget would be exceeded', () => {
      const tracker = createBudgetTracker({
        ...defaultConfig,
        monthlyMaxUsd: 10.0,
      });
      const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 100.0 } });

      tracker.recordSpend('task-1', 'code', 4.0);
      tracker.recordSpend('task-2', 'code', 4.0);
      tracker.recordSpend('task-3', 'design', 1.5);
      const result = tracker.checkBudget(agent, 'task-4', 'code', makeEstimate(1.0));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_PROJECT');
        expect(result.error.message).toContain('Monthly budget exceeded');
      }
    });
  });

  describe('recordSpend', () => {
    it('accumulates correctly across calls', () => {
      const tracker = createBudgetTracker(defaultConfig);

      tracker.recordSpend('task-1', 'code', 0.50);
      tracker.recordSpend('task-1', 'code', 0.30);

      expect(tracker.getTaskSpend('task-1')).toBeCloseTo(0.80);
    });
  });

  describe('getTaskSpend', () => {
    it('returns 0 for unknown task', () => {
      const tracker = createBudgetTracker(defaultConfig);

      expect(tracker.getTaskSpend('unknown')).toBe(0);
    });

    it('returns correct spend for known task', () => {
      const tracker = createBudgetTracker(defaultConfig);
      tracker.recordSpend('task-1', 'code', 1.25);

      expect(tracker.getTaskSpend('task-1')).toBeCloseTo(1.25);
    });
  });

  describe('getState', () => {
    it('returns BudgetState for task level', () => {
      const tracker = createBudgetTracker(defaultConfig);
      tracker.recordSpend('task-1', 'code', 1.00);

      const state = tracker.getState('task', 'task-1');

      expect(state).toBeDefined();
      expect(state!.level).toBe('task');
      expect(state!.entityId).toBe('task-1');
      expect(state!.spentUsd).toBeCloseTo(1.00);
      expect(state!.limitUsd).toBe(2.0);
      expect(state!.exhausted).toBe(false);
    });

    it('returns BudgetState for phase level', () => {
      const tracker = createBudgetTracker(defaultConfig);
      tracker.recordSpend('task-1', 'code', 5.00);

      const state = tracker.getState('phase', 'code');

      expect(state).toBeDefined();
      expect(state!.level).toBe('phase');
      expect(state!.spentUsd).toBeCloseTo(5.00);
    });

    it('returns BudgetState for project level', () => {
      const tracker = createBudgetTracker(defaultConfig);
      tracker.recordSpend('task-1', 'code', 10.00);

      const state = tracker.getState('project', 'monthly');

      expect(state).toBeDefined();
      expect(state!.level).toBe('project');
      expect(state!.spentUsd).toBeCloseTo(10.00);
    });

    it('returns undefined for unknown task', () => {
      const tracker = createBudgetTracker(defaultConfig);

      expect(tracker.getState('task', 'nonexistent')).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      const tracker = createBudgetTracker(defaultConfig);

      tracker.recordSpend('task-1', 'code', 1.00);
      tracker.recordSpend('task-2', 'design', 2.00);
      tracker.reset();

      expect(tracker.getTaskSpend('task-1')).toBe(0);
      expect(tracker.getTaskSpend('task-2')).toBe(0);
      expect(tracker.getState('task', 'task-1')).toBeUndefined();
      expect(tracker.getState('project', 'monthly')).toBeDefined();
      expect(tracker.getState('project', 'monthly')!.spentUsd).toBe(0);
    });
  });

  describe('budget alerts', () => {
    it('emits alert via eventBus when threshold reached', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const tracker = createBudgetTracker(defaultConfig, eventBus);

      // Spend 80% of task budget (threshold is 0.8)
      tracker.recordSpend('task-1', 'code', 1.60);

      expect(events.length).toBeGreaterThan(0);
      const alert = events.find(
        (e) => (e as Record<string, unknown>).type === 'BudgetAlert',
      ) as Record<string, unknown> | undefined;
      expect(alert).toBeDefined();
      expect((alert!.payload as Record<string, unknown>).level).toBe('task');
      expect((alert!.payload as Record<string, unknown>).severity).toBe('warning');
    });

    it('does not emit duplicate alerts', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const tracker = createBudgetTracker(defaultConfig, eventBus);

      tracker.recordSpend('task-1', 'code', 1.60);
      const countAfterFirst = events.filter(
        (e) =>
          (e as Record<string, unknown>).type === 'BudgetAlert' &&
          ((e as Record<string, { level: string }>).payload).level === 'task',
      ).length;

      tracker.recordSpend('task-1', 'code', 0.10);
      const countAfterSecond = events.filter(
        (e) =>
          (e as Record<string, unknown>).type === 'BudgetAlert' &&
          ((e as Record<string, { level: string }>).payload).level === 'task',
      ).length;

      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });
});
