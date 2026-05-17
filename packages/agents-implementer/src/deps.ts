/**
 * @module @agentforge/agents-implementer/deps
 *
 * Dependency injection types for the Implementer pipeline.
 * Each node factory closes over ImplementerDeps to receive
 * its LLM provider and project context.
 * Mirrors ArchitectDeps in @agentforge/agents-architect/deps.
 */

import type { LLMProvider } from '@agentforge/providers';
import type { ImplementerStateType } from './graph/state.js';

/** Dependencies injected into Implementer node factories. */
export interface ImplementerDeps {
  /** LLM provider wrapped with createTracedProvider (ADR-046). */
  readonly provider: LLMProvider;
  /** Filesystem root for file read/write tools. */
  readonly projectRoot: string;
  /** Project identifier — scopes telemetry and retrieval queries. */
  readonly projectId: string;
}

/** Node function signature for LangGraph StateGraph nodes. */
export type ImplementerNodeFn = (
  state: ImplementerStateType,
) => Promise<Partial<ImplementerStateType>>;
