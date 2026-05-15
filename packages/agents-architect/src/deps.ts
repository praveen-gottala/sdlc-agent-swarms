/**
 * @module @agentforge/agents-architect/deps
 *
 * Dependency injection types for the Architect pipeline.
 * Each node factory closes over ArchitectDeps to receive
 * its LLM provider, retrieval tools, and project context.
 * Mirrors ClarifierDeps in @agentforge/agents-clarifier/deps.
 */

import type { LLMProvider } from '@agentforge/providers';
import type { RetrievalTools } from '@agentforge/retrieval';
import type { DesignSystemContext } from '@agentforge/agents-ux';
import type { ArchitectStateType } from './graph/state.js';

/** Dependencies injected into Architect node factories. */
export interface ArchitectDeps {
  /** LLM provider wrapped with createTracedProvider (ADR-046). */
  readonly provider: LLMProvider;
  /** Retrieval tools — required for brownfield Node 1 repo-map digest. */
  readonly retrievalTools?: RetrievalTools;
  /** Filesystem root for Node 4.5 design-system-diff token reads. */
  readonly projectRoot: string;
  /** Project identifier — scopes retrieval queries. */
  readonly projectId: string;
  /** Pre-loaded base catalog YAML for Critic Node 6 catalog adoption checks. */
  readonly baseCatalog?: string;
  /** Pre-built design system context (skips Node 4.5 LLM call when present). */
  readonly designSystemContext?: DesignSystemContext;
}

/** Node function signature for LangGraph StateGraph nodes. */
export type ArchitectNodeFn = (state: ArchitectStateType) => Promise<Partial<ArchitectStateType>>;
