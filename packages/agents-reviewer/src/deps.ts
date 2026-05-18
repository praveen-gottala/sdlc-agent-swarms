/**
 * @module @agentforge/agents-reviewer/deps
 *
 * Dependency injection types for the Reviewer pipeline.
 * Each node factory closes over ReviewerDeps to receive
 * its LLM provider and project context.
 * Mirrors ImplementerDeps in @agentforge/agents-implementer/deps.
 */

import type { LLMProvider } from '@agentforge/providers';
import type { ReviewerStateType } from './graph/state.js';

/** Dependencies injected into Reviewer node factories. */
export interface ReviewerDeps {
  /** LLM provider wrapped with createTracedProvider (ADR-046). */
  readonly provider: LLMProvider;
  /** Filesystem root for governance scans. */
  readonly projectRoot: string;
  /** Project identifier — scopes telemetry queries. */
  readonly projectId: string;
  /** Optional plan file paths for rubric gate coverage checks. */
  readonly planFilePaths?: readonly string[];
}

/** Node function signature for LangGraph StateGraph nodes. */
export type ReviewerNodeFn = (
  state: ReviewerStateType,
) => Promise<Partial<ReviewerStateType>>;
