/**
 * @module @agentforge/core/types/cost
 *
 * Cost tracking types for LLM usage.
 */

/**
 * Record of actual cost incurred by a single LLM call.
 */
// DEVIATION: ADR-008
// PRD v2.0 Section 4.2 specifies: "Every agent call tracks token usage, API cost, and wall-clock time"
// Implementation: inputTokens, outputTokens, wallClockMs are optional for backward compatibility
// Rationale: see ADR-008
export interface CostRecord {
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
  readonly model: string;
  readonly timestamp: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly wallClockMs?: number;
  readonly agentId?: string;
  readonly taskId?: string;
  readonly phase?: string;
}

/**
 * Estimated cost for an upcoming LLM operation.
 * Used by governance to pre-check budget availability.
 */
/**
 * Cost breakdown for a single phase.
 */
export interface PhaseCostBreakdown {
  readonly phase: string;
  readonly totalCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly recordCount: number;
}

/**
 * Cost breakdown for a single agent.
 */
export interface AgentCostBreakdown {
  readonly agentId: string;
  readonly totalCostUsd: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly recordCount: number;
}

/**
 * Monthly cost report with breakdowns by phase and agent.
 */
export interface MonthlyCostReport {
  readonly month: string;
  readonly totalCostUsd: number;
  readonly byPhase: readonly PhaseCostBreakdown[];
  readonly byAgent: readonly AgentCostBreakdown[];
}

export interface CostEstimate {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedCostUsd: number;
  readonly confidence: 'high' | 'medium' | 'low';
}
