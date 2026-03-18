/**
 * @module @agentforge/agents-spec/task-decomposer/validate-graph
 *
 * Validates that a set of tasks with depends_on edges forms a DAG
 * (no cycles). Uses Kahn's algorithm for topological sort.
 */

import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

/** Minimal node shape needed for graph validation. */
export interface GraphNode {
  readonly id: string;
  readonly depends_on: readonly string[];
}

/**
 * Validate that a dependency graph has no cycles using Kahn's algorithm.
 *
 * @param nodes - Array of nodes with id and depends_on fields
 * @returns Ok(void) if acyclic, Err with cycle details if not
 */
export const validateDependencyGraph = (nodes: readonly GraphNode[]): Result<void> => {
  if (nodes.length === 0) {
    return Ok(undefined);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  // Build adjacency + in-degree
  for (const node of nodes) {
    for (const dep of node.depends_on) {
      if (!nodeIds.has(dep)) {
        continue; // Skip references to nodes outside the graph
      }
      // dep → node.id (dep must complete before node)
      adjacency.get(dep)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
    }
  }

  // BFS from zero in-degree nodes
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (processed < nodes.length) {
    const cycleNodes = nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) > 0)
      .map((n) => n.id);
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Dependency cycle detected among: ${cycleNodes.join(', ')}`,
      recoverable: false,
    });
  }

  return Ok(undefined);
};
