/**
 * @module delta-types
 * DesignSpecDelta schema and types — R9 §6.2 refined schema.
 */
import type { NodeSpec, DesignSpecV2 } from '../../types/design-spec-v2.js';
import type { Result } from '../../types/result.js';

/** A reorder instruction for an existing node. */
export interface ReorderEntry {
  readonly nodeId: string;
  readonly newParent?: string;
  readonly newOrder?: number;
}

/**
 * Delta between two DesignSpecV2 documents for the same screen.
 * Unchanged nodes are implicit — everything in the existing spec
 * not in added/modified/removed is kept as-is.
 */
export interface DesignSpecDelta {
  readonly screenId: string;
  readonly baseWidth: number;
  readonly added: Readonly<Record<string, NodeSpec>>;
  readonly modified: Readonly<Record<string, Partial<NodeSpec>>>;
  readonly removed: readonly string[];
  readonly reordered: readonly ReorderEntry[];
}

/** Result of applying a delta to a spec. */
export type DeltaApplyResult = Result<DesignSpecV2>;
