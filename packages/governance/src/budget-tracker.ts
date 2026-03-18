/**
 * @module @agentforge/governance/budget-tracker
 *
 * Tracks LLM spending at three levels: per-task, per-phase, and per-project (monthly).
 * Checks estimated costs against configured limits before allowing execution.
 * Emits budget alerts when thresholds are reached.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result, AgentForgeError, AgentContract, CostEstimate, CostRecord, MonthlyCostReport, PhaseCostBreakdown, AgentCostBreakdown } from '@agentforge/core';
import type { BudgetConfig, BudgetLevel, BudgetState, BudgetAlert } from './types.js';

/**
 * Minimal event publisher interface.
 * Avoids hard dependency on core's EventBus module.
 */
interface EventPublisher {
  publish(event: unknown): void;
}

/**
 * Interface for budget tracking across task, phase, and project levels.
 */
export interface BudgetTracker {
  /** Check if budget is available for an estimated cost. */
  checkBudget(agent: AgentContract, taskId: string, phase: string, estimate: CostEstimate): Result<void>;
  /** Record actual spend after an operation completes. */
  recordSpend(taskId: string, phase: string, amountUsd: number, agentId?: string): void;
  /** Record a full cost record with all details. */
  recordCost(record: CostRecord): void;
  /** Get budget state for a specific level and entity. */
  getState(level: BudgetLevel, entityId: string): BudgetState | undefined;
  /** Get total spend for a task. */
  getTaskSpend(taskId: string): number;
  /** Get monthly cost breakdown by phase and agent. */
  getCostBreakdown(): MonthlyCostReport;
  /** Reset all spend tracking. */
  reset(): void;
}

/**
 * Create a budget tracker that enforces per-task, per-phase, and monthly limits.
 *
 * @param config - Budget configuration with limits and alert threshold
 * @param eventBus - Optional event publisher for emitting budget alerts
 * @returns A BudgetTracker instance
 */
export const createBudgetTracker = (
  config: BudgetConfig,
  eventBus?: EventPublisher,
): BudgetTracker => {
  const taskSpend = new Map<string, number>();
  const phaseSpend = new Map<string, number>();
  const agentSpend = new Map<string, number>();
  const costRecords: CostRecord[] = [];
  let monthlySpend = 0;
  const alertsSent = new Set<string>();

  const maybeEmitAlert = (
    level: BudgetLevel,
    entityId: string,
    currentSpend: number,
    limit: number,
  ): void => {
    if (!eventBus) return;

    const ratio = currentSpend / limit;
    const alertKey = `${level}:${entityId}`;

    if (ratio >= config.alertThreshold && !alertsSent.has(alertKey)) {
      alertsSent.add(alertKey);
      const severity = ratio >= 1.0 ? 'hard_stop' : 'warning';
      const alert: BudgetAlert = {
        level,
        entityId,
        currentSpendUsd: currentSpend,
        limitUsd: limit,
        utilizationRatio: ratio,
        severity,
        timestamp: new Date().toISOString(),
        message: `Budget ${severity === 'hard_stop' ? 'exceeded' : 'warning'}: ${level} "${entityId}" at ${(ratio * 100).toFixed(0)}% ($${currentSpend.toFixed(2)}/$${limit.toFixed(2)})`,
      };
      eventBus.publish({ type: 'BudgetAlert', payload: alert });
    }
  };

  return {
    checkBudget(
      agent: AgentContract,
      taskId: string,
      phase: string,
      estimate: CostEstimate,
    ): Result<void> {
      // 1. Check task-level budget
      const taskTotal = (taskSpend.get(taskId) ?? 0) + estimate.estimatedCostUsd;
      const taskLimit = agent.budget.max_cost_per_task_usd;
      if (taskTotal > taskLimit) {
        return Err({
          code: 'BUDGET_EXCEEDED_TASK' as const,
          message: `Task budget exceeded: $${taskTotal.toFixed(2)} > $${taskLimit.toFixed(2)}`,
          context: { taskId, spent: taskTotal, limit: taskLimit },
          recoverable: false,
          agentId: agent.role,
          taskId,
        } as AgentForgeError);
      }

      // 2. Check phase-level budget
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

      // 3. Check monthly (project-level) budget
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

    recordSpend(taskId: string, phase: string, amountUsd: number, agentId?: string): void {
      const newTaskTotal = (taskSpend.get(taskId) ?? 0) + amountUsd;
      taskSpend.set(taskId, newTaskTotal);

      const newPhaseTotal = (phaseSpend.get(phase) ?? 0) + amountUsd;
      phaseSpend.set(phase, newPhaseTotal);

      if (agentId) {
        const newAgentTotal = (agentSpend.get(agentId) ?? 0) + amountUsd;
        agentSpend.set(agentId, newAgentTotal);
      }

      monthlySpend += amountUsd;

      // Emit alerts if thresholds reached
      maybeEmitAlert('task', taskId, newTaskTotal, config.perTaskMaxUsd);
      maybeEmitAlert('phase', phase, newPhaseTotal, config.perPhaseMaxUsd);
      maybeEmitAlert('project', 'monthly', monthlySpend, config.monthlyMaxUsd);
    },

    recordCost(record: CostRecord): void {
      costRecords.push(record);
      const taskId = record.taskId ?? 'unknown';
      const phase = record.phase ?? 'unknown';
      const agentId = record.agentId;

      const newTaskTotal = (taskSpend.get(taskId) ?? 0) + record.totalCostUsd;
      taskSpend.set(taskId, newTaskTotal);

      const newPhaseTotal = (phaseSpend.get(phase) ?? 0) + record.totalCostUsd;
      phaseSpend.set(phase, newPhaseTotal);

      if (agentId) {
        const newAgentTotal = (agentSpend.get(agentId) ?? 0) + record.totalCostUsd;
        agentSpend.set(agentId, newAgentTotal);
      }

      monthlySpend += record.totalCostUsd;

      maybeEmitAlert('task', taskId, newTaskTotal, config.perTaskMaxUsd);
      maybeEmitAlert('phase', phase, newPhaseTotal, config.perPhaseMaxUsd);
      maybeEmitAlert('project', 'monthly', monthlySpend, config.monthlyMaxUsd);
    },

    getState(level: BudgetLevel, entityId: string): BudgetState | undefined {
      let spentUsd: number;
      let limitUsd: number;

      switch (level) {
        case 'task':
          spentUsd = taskSpend.get(entityId) ?? 0;
          limitUsd = config.perTaskMaxUsd;
          break;
        case 'phase':
          spentUsd = phaseSpend.get(entityId) ?? 0;
          limitUsd = config.perPhaseMaxUsd;
          break;
        case 'project':
          spentUsd = monthlySpend;
          limitUsd = config.monthlyMaxUsd;
          break;
        default:
          return undefined;
      }

      if (spentUsd === 0 && level !== 'project') {
        return undefined;
      }

      const alertKey = `${level}:${entityId}`;

      return {
        level,
        entityId,
        spentUsd,
        limitUsd,
        tokensUsed: 0,
        alertSent: alertsSent.has(alertKey),
        exhausted: spentUsd >= limitUsd,
        lastUpdated: new Date().toISOString(),
        records: [],
      };
    },

    getTaskSpend(taskId: string): number {
      return taskSpend.get(taskId) ?? 0;
    },

    getCostBreakdown(): MonthlyCostReport {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      const byPhase: PhaseCostBreakdown[] = [];
      for (const [phase, total] of phaseSpend.entries()) {
        const phaseRecords = costRecords.filter((r) => r.phase === phase);
        byPhase.push({
          phase,
          totalCostUsd: total,
          totalInputTokens: phaseRecords.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
          totalOutputTokens: phaseRecords.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
          recordCount: phaseRecords.length,
        });
      }

      const byAgent: AgentCostBreakdown[] = [];
      for (const [agentId, total] of agentSpend.entries()) {
        const agentRecords = costRecords.filter((r) => r.agentId === agentId);
        byAgent.push({
          agentId,
          totalCostUsd: total,
          totalInputTokens: agentRecords.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0),
          totalOutputTokens: agentRecords.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0),
          recordCount: agentRecords.length,
        });
      }

      return {
        month,
        totalCostUsd: monthlySpend,
        byPhase,
        byAgent,
      };
    },

    reset(): void {
      taskSpend.clear();
      phaseSpend.clear();
      agentSpend.clear();
      costRecords.length = 0;
      monthlySpend = 0;
      alertsSent.clear();
    },
  };
};
