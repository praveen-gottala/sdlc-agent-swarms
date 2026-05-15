/**
 * @module @agentforge/agents-architect/types
 *
 * Local types for the Architect pipeline. Types that cross agent boundaries
 * live in @agentforge/core — these are internal to the Architect graph.
 */

/** Snapshot of repository file paths for brownfield mode. */
export interface RepoSnapshot {
  readonly rootPath: string;
  readonly filePaths: readonly string[];
  readonly packageJson?: Record<string, unknown>;
}

/** Retrieval context assembled by Node 1 (Context Assembler). */
export interface RetrievalContext {
  readonly codebaseDigest?: string;
  readonly relevantFiles?: readonly string[];
  readonly existingPatterns?: readonly string[];
}

/** Target node for retry routing after Critic failure. */
export type RetryTarget =
  | 'architectureWriter'
  | 'contractDesigner'
  | 'taskPlanner'
  | 'escalationGate';
