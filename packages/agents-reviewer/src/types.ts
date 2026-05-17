/**
 * @module @agentforge/agents-reviewer/types
 *
 * Local types for the Reviewer pipeline. Cross-agent types
 * (ReviewResult, ReviewFinding, Diff, etc.) live in @agentforge/core.
 */

/** A single deterministic gate result. */
export interface GateResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}
