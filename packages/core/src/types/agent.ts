/**
 * @module @agentforge/core/types/agent
 *
 * Types for agent learnings — observations agents accumulate
 * from human feedback, error recovery, and pattern detection.
 */

/**
 * Confidence level for an agent observation.
 */
export type ObservationConfidence = 'high' | 'medium' | 'low';

/**
 * A single learning observation recorded by an agent.
 */
export interface AgentLearning {
  /** Incremental ID, e.g. "obs_001" */
  readonly id: string;
  /** ISO8601 date when the observation was recorded */
  readonly date: string;
  /** Origin of the learning, e.g. "human_feedback_on_task_001" | "pattern_detected" | "error_recovery" */
  readonly source: string;
  /** Concise description of what was learned */
  readonly learning: string;
  /** How confident the agent is in this observation */
  readonly confidence: ObservationConfidence;
  /** Reference to the task that triggered this learning, or null */
  readonly taskRef: string | null;
  /** Whether this learning is still considered relevant */
  readonly active: boolean;
  /** Optional ISO8601 expiry date — learnings past this date are filtered out */
  readonly expires?: string;
}
