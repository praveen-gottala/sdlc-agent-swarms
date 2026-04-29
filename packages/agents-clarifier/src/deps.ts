/**
 * @module @agentforge/agents-clarifier/deps
 *
 * Dependency injection types for the Clarifier pipeline.
 * Each node factory closes over ClarifierDeps to receive
 * its LLM provider, retrieval tools, and project context.
 */

import type { LLMProvider } from '@agentforge/providers';
import type { RetrievalTools } from '@agentforge/retrieval';
import type { ClarifierState } from './types.js';

/** Dependencies injected into Clarifier node factories. */
export interface ClarifierDeps {
  /** LLM provider wrapped with createTracedProvider (ADR-046). */
  readonly provider: LLMProvider;
  /** Retrieval tools — required for evolution mode, optional for bootstrap. */
  readonly retrievalTools?: RetrievalTools;
  /** Filesystem root for file reads (catalog, design tokens). */
  readonly projectRoot: string;
  /** Project identifier — scopes retrieval queries. */
  readonly projectId: string;
  /** Pre-loaded base catalog YAML — avoids import.meta.url under webpack. */
  readonly baseCatalog?: string;
}

/** Node function signature for LangGraph StateGraph nodes. */
export type ClarifierNodeFn = (state: ClarifierState) => Promise<Partial<ClarifierState>>;
