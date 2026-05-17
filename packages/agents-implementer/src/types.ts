/**
 * @module @agentforge/agents-implementer/types
 *
 * Local types for the Implementer pipeline. Cross-agent types
 * (TaskNode, ContractBundle, etc.) live in @agentforge/core.
 */

/** Record of a single tool invocation during code generation. */
export interface ToolCallRecord {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly result: string;
  readonly durationMs: number;
}

/** An artifact produced by the Implementer (file written or modified). */
export interface ImplementerArtifact {
  readonly path: string;
  readonly action: 'created' | 'modified';
  readonly contentHash: string;
}
