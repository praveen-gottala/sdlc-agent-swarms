/**
 * @module @agentforge/governance/budget-tracker
 *
 * Tracks LLM spending at three levels: per-task, per-phase, and per-project (monthly).
 * Checks estimated costs against configured limits before allowing execution.
 * Emits budget alerts when thresholds are reached.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result, AgentForgeError, AgentContract, CostEstimate } from '@agentforge/core';
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
  recordSpend(taskId: string, phase: string, amountUsd: number): void;
  /** Get budget state for a specific level and entity. */
  getState(level: BudgetLevel, entityId: string): BudgetState | undefined;
  /** Get total spend for a task. */
  getTaskSpend(taskId: string): number;
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

    recordSpend(taskId: string, phase: string, amountUsd: number): void {
      const newTaskTotal = (taskSpend.get(taskId) ?? 0) + amountUsd;
      taskSpend.set(taskId, newTaskTotal);

      const newPhaseTotal = (phaseSpend.get(phase) ?? 0) + amountUsd;
      phaseSpend.set(phase, newPhaseTotal);

      monthlySpend += amountUsd;

      // Emit alerts if thresholds reached
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

    reset(): void {
      taskSpend.clear();
      phaseSpend.clear();
      monthlySpend = 0;
      alertsSent.clear();
    },
  };
};
