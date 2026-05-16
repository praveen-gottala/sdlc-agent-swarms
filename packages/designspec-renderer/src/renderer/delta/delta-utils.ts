/**
 * @module delta-utils
 * Pure functions for applying and computing DesignSpecV2 deltas.
 */
import type { DesignSpecV2, NodeSpec } from '../../types/design-spec-v2.js';
import type { DesignSpecDelta, DeltaApplyResult } from './delta-types.js';
import { Ok, Err } from '../../types/result.js';

/**
 * Apply a delta to an existing DesignSpecV2, producing the post-change spec.
 * Pure, deterministic, no async. Returns Err on invalid references.
 */
export function deltaApply(
  existing: DesignSpecV2,
  delta: DesignSpecDelta,
): DeltaApplyResult {
  const nodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(existing.nodes)) {
    nodes[id] = { ...node };
  }

  // 1. Remove (+ cascade to descendants)
  const removedSet = new Set(delta.removed);
  for (const id of delta.removed) {
    if (!nodes[id]) {
      return Err({
        code: 'NODE_NOT_FOUND',
        message: `Cannot remove node "${id}": not found in existing spec`,
      });
    }
    delete nodes[id];
  }
  // Cascade: remove any node whose parent chain leads to a removed ancestor
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(nodes)) {
      if (node.parent && !nodes[node.parent] && removedSet.has(node.parent)) {
        delete nodes[id];
        removedSet.add(id);
        changed = true;
      }
    }
  }

  // 2. Add
  for (const [id, spec] of Object.entries(delta.added)) {
    if (spec.parent !== null && !nodes[spec.parent] && !delta.added[spec.parent]) {
      return Err({
        code: 'INVALID_PARENT',
        message: `Cannot add node "${id}": parent "${spec.parent}" not found`,
      });
    }
    nodes[id] = { ...spec };
  }

  // 3. Modify (shallow merge per node)
  for (const [id, changes] of Object.entries(delta.modified)) {
    if (!nodes[id]) {
      return Err({
        code: 'NODE_NOT_FOUND',
        message: `Cannot modify node "${id}": not found in spec`,
      });
    }
    nodes[id] = { ...nodes[id], ...changes } as NodeSpec;
  }

  // 4. Reorder
  for (const { nodeId, newParent, newOrder } of delta.reordered) {
    if (!nodes[nodeId]) {
      return Err({
        code: 'NODE_NOT_FOUND',
        message: `Cannot reorder node "${nodeId}": not found in spec`,
      });
    }
    const patched = { ...nodes[nodeId] } as Record<string, unknown>;
    if (newParent !== undefined) patched['parent'] = newParent;
    if (newOrder !== undefined) patched['order'] = newOrder;
    nodes[nodeId] = patched as unknown as NodeSpec;
  }

  return Ok({
    ...existing,
    nodes,
  });
}

/**
 * Compute a DesignSpecDelta by diffing two specs for the same screen.
 * Pure, deterministic. The round-trip property holds:
 * deltaApply(existing, deltaCompute(existing, applied)) deep-equals applied.
 */
export function deltaCompute(
  existing: DesignSpecV2,
  applied: DesignSpecV2,
): DesignSpecDelta {
  const added: Record<string, NodeSpec> = {};
  const modified: Record<string, Partial<NodeSpec>> = {};
  const removed: string[] = [];
  const reordered: Array<{ nodeId: string; newParent?: string; newOrder?: number }> = [];

  const existingIds = new Set(Object.keys(existing.nodes));
  const appliedIds = new Set(Object.keys(applied.nodes));

  // Nodes in applied but not in existing → added
  for (const id of appliedIds) {
    if (!existingIds.has(id)) {
      added[id] = applied.nodes[id];
    }
  }

  // Nodes in existing but not in applied → removed
  for (const id of existingIds) {
    if (!appliedIds.has(id)) {
      removed.push(id);
    }
  }

  // Nodes in both — check for field differences
  for (const id of existingIds) {
    if (!appliedIds.has(id)) continue;

    const existNode = existing.nodes[id];
    const appliedNode = applied.nodes[id];
    const diff = computeNodeDiff(existNode, appliedNode);

    if (diff === null) continue;

    // If only order changed, it's a reorder
    const diffKeys = Object.keys(diff);
    if (diffKeys.length === 1 && diffKeys[0] === 'order') {
      reordered.push({
        nodeId: id,
        newOrder: diff.order as number,
      });
    } else if (diffKeys.length === 2 && diffKeys.includes('order') && diffKeys.includes('parent')) {
      reordered.push({
        nodeId: id,
        newParent: diff.parent as string,
        newOrder: diff.order as number,
      });
    } else {
      modified[id] = diff;
    }
  }

  return {
    screenId: applied.screen,
    baseWidth: applied.width,
    added,
    modified,
    removed,
    reordered,
  };
}

/** Compute field-level diff between two NodeSpecs. Returns null if identical. */
function computeNodeDiff(
  existing: NodeSpec,
  applied: NodeSpec,
): Partial<NodeSpec> | null {
  const diff: Record<string, unknown> = {};
  const allKeys = new Set([
    ...Object.keys(existing),
    ...Object.keys(applied),
  ]);

  for (const key of allKeys) {
    const existVal = (existing as unknown as Record<string, unknown>)[key];
    const appliedVal = (applied as unknown as Record<string, unknown>)[key];

    if (!deepEqual(existVal, appliedVal)) {
      diff[key] = appliedVal;
    }
  }

  return Object.keys(diff).length > 0 ? diff as Partial<NodeSpec> : null;
}

/** Deep equality check for JSON-serializable values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, (b as unknown[])[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => deepEqual(aObj[key], bObj[key]));
}
