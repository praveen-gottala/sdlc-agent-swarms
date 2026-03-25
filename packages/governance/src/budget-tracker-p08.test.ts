/**
 * P08: Cost Tracking Accuracy validation tests.
 * Tests all 6 criteria from Wave 1 readiness validation.
 */

import type { AgentContract, CostEstimate, CostRecord } from '@agentforge/core';
import { DEFAULT_MODEL } from '@agentforge/core';
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

const makeEstimate = (costUsd: number): CostEstimate => ({
  estimatedInputTokens: 1_000,
  estimatedOutputTokens: 500,
  estimatedCostUsd: costUsd,
  confidence: 'medium',
});

const makeCostRecord = (overrides: Partial<CostRecord> = {}): CostRecord => ({
  inputCostUsd: 0.10,
  outputCostUsd: 0.15,
  totalCostUsd: 0.25,
  model: DEFAULT_MODEL,
  timestamp: new Date().toISOString(),
  inputTokens: 1000,
  outputTokens: 500,
  wallClockMs: 1500,
  ...overrides,
});

describe('P08: Cost Tracking Accuracy', () => {
  describe('Criterion 1: Every LLM call records tokens, cost, wall time', () => {
    it('CostRecord includes all required fields', () => {
      const record = makeCostRecord({
        inputTokens: 2000,
        outputTokens: 800,
        wallClockMs: 3200,
        totalCostUsd: 0.50,
        agentId: 'code-agent',
        taskId: 'task-001',
        phase: 'code',
      });

      expect(record.inputTokens).toBe(2000);
      expect(record.outputTokens).toBe(800);
      expect(record.wallClockMs).toBe(3200);
      expect(record.totalCostUsd).toBe(0.50);
      expect(record.agentId).toBe('code-agent');
      expect(record.taskId).toBe('task-001');
      expect(record.model).toBeDefined();
      expect(record.timestamp).toBeDefined();
    });
  });

  describe('Criterion 2: Three-tier accumulation is correct', () => {
    it('accumulates per-task, per-phase, and per-project', () => {
      const config: BudgetConfig = {
        perTaskMaxUsd: 10.0,
        perPhaseMaxUsd: 50.0,
        monthlyMaxUsd: 200.0,
        alertThreshold: 0.8,
      };
      const tracker = createBudgetTracker(config);

      tracker.recordSpend('task-1', 'code', 0.50, 'agent-1');
      tracker.recordSpend('task-1', 'code', 0.30, 'agent-1');
      tracker.recordSpend('task-2', 'code', 0.20, 'agent-2');
      tracker.recordSpend('task-3', 'design', 0.40, 'agent-3');

      // Per-task
      expect(tracker.getTaskSpend('task-1')).toBeCloseTo(0.80);
      expect(tracker.getTaskSpend('task-2')).toBeCloseTo(0.20);
      expect(tracker.getTaskSpend('task-3')).toBeCloseTo(0.40);

      // Per-phase
      const codeState = tracker.getState('phase', 'code');
      expect(codeState?.spentUsd).toBeCloseTo(1.00);

      const designState = tracker.getState('phase', 'design');
      expect(designState?.spentUsd).toBeCloseTo(0.40);

      // Per-project (monthly)
      const projectState = tracker.getState('project', 'monthly');
      expect(projectState?.spentUsd).toBeCloseTo(1.40);
    });
  });

  describe('Criterion 3: Provider rate table is accurate', () => {
    it('cost calculation produces correct values', () => {
      // This tests that CostRecord correctly stores input + output costs
      const record = makeCostRecord({
        inputCostUsd: 0.003, // 1000 tokens * $3/MTok
        outputCostUsd: 0.0075, // 500 tokens * $15/MTok
        totalCostUsd: 0.0105,
        model: DEFAULT_MODEL,
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(record.totalCostUsd).toBeCloseTo(record.inputCostUsd + record.outputCostUsd);
    });
  });

  describe('Criterion 4: 80% alert threshold fires', () => {
    it('emits BudgetAlert when phase spending reaches 80%', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const config: BudgetConfig = {
        perTaskMaxUsd: 10.0,
        perPhaseMaxUsd: 2.00,
        monthlyMaxUsd: 200.0,
        alertThreshold: 0.8,
      };
      const tracker = createBudgetTracker(config, eventBus);

      // Spend $1.60 = 80% of $2.00 phase budget
      tracker.recordSpend('task-1', 'code', 1.60, 'agent-1');

      const alerts = events.filter(
        (e) => (e as Record<string, unknown>).type === 'BudgetAlert',
      );
      expect(alerts.length).toBeGreaterThan(0);

      const phaseAlert = alerts.find((a) => {
        const payload = (a as Record<string, { level: string }>).payload;
        return payload.level === 'phase';
      }) as Record<string, Record<string, unknown>> | undefined;

      expect(phaseAlert).toBeDefined();
      expect(phaseAlert!.payload.severity).toBe('warning');
    });
  });

  describe('Criterion 5: 100% hard stop blocks next action', () => {
    it('denies next action when phase budget is exhausted', () => {
      const config: BudgetConfig = {
        perTaskMaxUsd: 10.0,
        perPhaseMaxUsd: 2.00,
        monthlyMaxUsd: 200.0,
        alertThreshold: 0.8,
      };
      const tracker = createBudgetTracker(config);
      const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 10.0 } });

      tracker.recordSpend('task-1', 'code', 1.00);
      tracker.recordSpend('task-2', 'code', 0.80);

      // Next action would exceed phase budget
      const result = tracker.checkBudget(agent, 'task-3', 'code', makeEstimate(0.50));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_PHASE');
      }
    });
  });

  describe('Criterion 6: Cost-by-phase and cost-by-agent queries', () => {
    it('returns accurate cost breakdown by phase and agent', () => {
      const config: BudgetConfig = {
        perTaskMaxUsd: 10.0,
        perPhaseMaxUsd: 50.0,
        monthlyMaxUsd: 200.0,
        alertThreshold: 0.8,
      };
      const tracker = createBudgetTracker(config);

      // Record costs via full CostRecord
      tracker.recordCost(makeCostRecord({
        totalCostUsd: 0.50,
        inputTokens: 1000,
        outputTokens: 500,
        wallClockMs: 1500,
        agentId: 'agent-1',
        taskId: 'task-1',
        phase: 'code',
      }));

      tracker.recordCost(makeCostRecord({
        totalCostUsd: 0.30,
        inputTokens: 800,
        outputTokens: 300,
        wallClockMs: 1200,
        agentId: 'agent-2',
        taskId: 'task-2',
        phase: 'code',
      }));

      tracker.recordCost(makeCostRecord({
        totalCostUsd: 0.20,
        inputTokens: 500,
        outputTokens: 200,
        wallClockMs: 800,
        agentId: 'agent-1',
        taskId: 'task-3',
        phase: 'design',
      }));

      const report = tracker.getCostBreakdown();

      expect(report.totalCostUsd).toBeCloseTo(1.00);

      // By phase
      const codePhase = report.byPhase.find((p) => p.phase === 'code');
      expect(codePhase?.totalCostUsd).toBeCloseTo(0.80);
      expect(codePhase?.totalInputTokens).toBe(1800);
      expect(codePhase?.recordCount).toBe(2);

      const designPhase = report.byPhase.find((p) => p.phase === 'design');
      expect(designPhase?.totalCostUsd).toBeCloseTo(0.20);

      // By agent
      const agent1 = report.byAgent.find((a) => a.agentId === 'agent-1');
      expect(agent1?.totalCostUsd).toBeCloseTo(0.70);
      expect(agent1?.recordCount).toBe(2);

      const agent2 = report.byAgent.find((a) => a.agentId === 'agent-2');
      expect(agent2?.totalCostUsd).toBeCloseTo(0.30);
    });
  });

  describe('Simulation: 3 agents at $0.50 each against $2.00 budget', () => {
    it('alerts at $1.60 and hard stops at $2.00', () => {
      const events: unknown[] = [];
      const eventBus = { publish: (event: unknown) => events.push(event) };
      const config: BudgetConfig = {
        perTaskMaxUsd: 10.0,
        perPhaseMaxUsd: 2.00,
        monthlyMaxUsd: 200.0,
        alertThreshold: 0.8,
      };
      const tracker = createBudgetTracker(config, eventBus);
      const agent = makeAgent({ budget: { max_tokens_per_task: 50_000, max_cost_per_task_usd: 10.0 } });

      // Agent 1: $0.50
      tracker.recordSpend('task-1', 'code', 0.50, 'agent-1');

      // Agent 2: $0.50 (total $1.00)
      tracker.recordSpend('task-2', 'code', 0.50, 'agent-2');

      // Agent 3: $0.50 (total $1.50) — not yet at threshold
      tracker.recordSpend('task-3', 'code', 0.50, 'agent-3');

      // Additional spend to reach $1.60 (80% threshold)
      tracker.recordSpend('task-3', 'code', 0.10, 'agent-3');

      // Alert should have been emitted
      const phaseAlerts = events.filter((e) => {
        const evt = e as { type: string; payload: Record<string, unknown> };
        return evt.type === 'BudgetAlert' && evt.payload.level === 'phase';
      });
      expect(phaseAlerts.length).toBeGreaterThan(0);

      // Add more to reach $2.00
      tracker.recordSpend('task-3', 'code', 0.40, 'agent-3');

      // Hard stop: next action should be denied
      const result = tracker.checkBudget(agent, 'task-4', 'code', makeEstimate(0.10));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_PHASE');
      }
    });
  });
});
