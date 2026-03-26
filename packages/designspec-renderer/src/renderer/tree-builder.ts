/**
 * @module @agentforge/designspec-renderer/renderer/tree-builder
 * Converts a flat adjacency list (DesignSpecV2.nodes) into a TreeNode tree.
 */
import type { NodeSpec } from '../types/design-spec-v2.js';
import type { TreeNode } from '../types/catalog.js';

/**
 * Build a tree from a flat adjacency list.
 * Finds the root node (parent === null), groups children by parent,
 * sorts siblings by order, and recursively builds the tree.
 *
 * @throws Error if no root node found or multiple roots exist
 */
export function buildTree(nodes: Readonly<Record<string, NodeSpec>>): TreeNode {
  // 1. Find root (parent === null)
  const roots: string[] = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent === null) {
      roots.push(id);
    }
  }

  if (roots.length === 0) {
    throw new Error('No root node found (no node with parent === null)');
  }
  if (roots.length > 1) {
    throw new Error(`Multiple root nodes found: ${roots.join(', ')}`);
  }

  const rootId = roots[0];

  // 2. Group children by parent
  const childrenOf = new Map<string, Array<{ id: string; node: NodeSpec }>>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent !== null) {
      const siblings = childrenOf.get(node.parent) ?? [];
      siblings.push({ id, node });
      childrenOf.set(node.parent, siblings);
    }
  }

  // 3. Sort each group by order
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.node.order - b.node.order);
  }

  // 4. Recursively build tree
  function build(id: string): TreeNode {
    const node = nodes[id];
    const children = childrenOf.get(id)?.map(c => build(c.id)) ?? [];
    return {
      id,
      parent: node.parent,
      order: node.order,
      type: node.type,
      catalog: node.catalog,
      label: node.label,
      content: node.content,
      value: node.value,
      placeholder: node.placeholder,
      helper: node.helper,
      title: node.title,
      options: node.options,
      layout: node.layout,
      width: node.width,
      height: node.height,
      typography: node.typography,
      color: node.color,
      weight: node.weight,
      background: node.background,
      overrides: node.overrides,
      items: node.items,
      children,
    };
  }

  return build(rootId);
}
