/**
 * @module @agentforge/core/types/cost
 *
 * Cost tracking types for LLM usage.
 */

/**
 * Record of actual cost incurred by a single LLM call.
 */
export interface CostRecord {
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
  readonly model: string;
  readonly timestamp: string;
}

/**
 * Estimated cost for an upcoming LLM operation.
 * Used by governance to pre-check budget availability.
 */
export interface CostEstimate {
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
  readonly estimatedCostUsd: number;
  readonly confidence: 'high' | 'medium' | 'low';
}
