/**
 * @module @agentforge/agents-reviewer
 *
 * Reviewer pipeline — fourth spine stage (vision Layer 9).
 * Deterministic gates first, LLM review second. Emits ReviewResult
 * with outcome enum for caller-driven bounded retry.
 *
 * ## Bounded Retry Contract
 *
 * The Reviewer does NOT orchestrate the revision loop. The caller
 * (CLI spine-implement-task in M4, orchestrator post-R1) is responsible for:
 *
 * 1. Tracking `revisionCycle` per task (starts at 0).
 * 2. If `outcome === 'rejected'` and `revisionCycle < 2`:
 *    - Inject `ReviewResult.findings` into the Implementer's next-cycle prompt.
 *    - Re-invoke the Implementer to produce a new diff.
 *    - Re-invoke the Reviewer on the new diff with `revisionCycle + 1`.
 * 3. If `revisionCycle >= 2` or `outcome === 'escalated'`:
 *    - Surface to HITL (human-in-the-loop) for manual resolution.
 *    - Do NOT retry further.
 * 4. If `outcome === 'approved'`:
 *    - Proceed to merge gate (HITL interrupt in orchestrator).
 *
 * Vision Layer 9 mandates "≤ 2 retries before escalation" — this
 * contract enforces that invariant at the caller level.
 *
 * ## 4-node topology (vision Layer 9 compliant)
 *
 * Vision Layer 9 specifies a 4-pass pipeline: deterministic gates →
 * LLM review → assumption validator → emit result. The assumption
 * validator runs a deterministic contradiction scan for resolved
 * assumptions and a focused LLM pass for unresolved ones.
 */

// --- Dependency injection ---
export type { ReviewerDeps, ReviewerNodeFn } from './deps.js';

// --- Local types ---
export type { GateResult, AssumptionValidationResult } from './types.js';

// --- State definition ---
export { ReviewerStateAnnotation } from './graph/state.js';
export type { ReviewerStateType } from './graph/state.js';

// --- Graph builder ---
export {
  buildReviewerGraph,
  compileReviewerGraph,
} from './graph/reviewer-graph.js';

// --- Node factories ---
export { createDeterministicGates } from './graph/nodes/deterministic-gates.js';
export { createLlmReview } from './graph/nodes/llm-review.js';
export { createAssumptionValidator } from './graph/nodes/assumption-validator.js';
export { createEmitReviewResult } from './graph/nodes/emit-review-result.js';

// --- Pipeline runner ---
export {
  runReviewerPipelineStream,
  runReviewer,
} from './run.js';
export type {
  ReviewerInput,
  ReviewerOutput,
  ReviewerStreamEvent,
  ReviewerError,
} from './run.js';
