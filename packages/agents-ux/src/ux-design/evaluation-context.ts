/**
 * @module @agentforge/agents-ux/ux-design/evaluation-context
 *
 * Builds a compact text representation of a DesignSpecV2 for the vision evaluator.
 * The vision LLM sees a screenshot — it already knows layout, spacing, colors.
 * This context conveys only INTENT: component names, text content, catalog entries,
 * navigateTo targets, and background token references.
 *
 * Reduces evaluator input from ~4,000-15,000 tokens (raw JSON) to ~300-600 tokens.
 */

import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';

const MAX_DEPTH = 5;
const MAX_TEXT_LENGTH = 60;
const MAX_ITEMS_SHOWN = 10;

interface TreeNode {
  readonly id: string;
  readonly node: NodeSpec;
  readonly children: TreeNode[];
}

function findRootId(nodes: Readonly<Record<string, NodeSpec>>): string | null {
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent === null) return id;
  }
  return null;
}

function buildTree(
  nodes: Readonly<Record<string, NodeSpec>>,
  rootId: string,
): TreeNode {
  const visited = new Set<string>();
  const build = (id: string): TreeNode => {
    visited.add(id);
    const node = nodes[id];
    const childEntries = Object.entries(nodes)
      .filter(([childId, n]) => n.parent === id && !visited.has(childId))
      .sort(([, a], [, b]) => a.order - b.order);
    const children = childEntries.map(([childId]) => build(childId));
    return { id, node, children };
  };
  return build(rootId);
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + '...';
}

function formatNodeLine(id: string, node: NodeSpec, specWidth: number): string {
  const parts: string[] = [id];

  const typeOrCatalog = node.catalog ?? node.type;
  if (typeOrCatalog) parts.push(`[${typeOrCatalog}]`);

  const text = node.label ?? node.content ?? node.title;
  if (text) parts.push(`"${truncateText(text)}"`);

  if (node.placeholder) parts.push(`placeholder:"${truncateText(node.placeholder)}"`);

  if (node.background) parts.push(`bg:${node.background}`);
  if (node.color) parts.push(`text:${node.color}`);

  if (node.navigateTo) parts.push(`→ ${node.navigateTo}`);
  if (node.active) parts.push('(active)');

  if (typeof node.width === 'number' && node.width < specWidth) {
    parts.push(`(${node.width}px)`);
  }

  return parts.join(' ');
}

function formatItems(items: readonly Readonly<Record<string, unknown>>[]): string {
  const labels = items.map((item) => {
    const label = (item.label ?? item.name ?? item.title ?? '') as string;
    const active = item.active ? '(active)' : '';
    return label + active;
  }).filter(Boolean);

  if (labels.length <= MAX_ITEMS_SHOWN) return `items: ${labels.join(', ')}`;
  return `items: ${labels.slice(0, MAX_ITEMS_SHOWN).join(', ')} ... +${labels.length - MAX_ITEMS_SHOWN} more`;
}

function summarizeChildren(children: TreeNode[]): string {
  const typeCounts = new Map<string, number>();
  for (const child of children) {
    const t = child.node.catalog ?? child.node.type ?? 'node';
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const summary = [...typeCounts.entries()]
    .map(([t, c]) => `${c} ${t}`)
    .join(', ');
  return `... ${children.length} child nodes (${summary})`;
}

function renderTree(
  tree: TreeNode,
  specWidth: number,
  depth: number,
  lines: string[],
): void {
  const indent = '  '.repeat(depth);
  const line = formatNodeLine(tree.id, tree.node, specWidth);

  if (tree.node.items?.length) {
    lines.push(`${indent}- ${line}`);
    lines.push(`${indent}  ${formatItems(tree.node.items)}`);
  } else {
    lines.push(`${indent}- ${line}`);
  }

  if (depth >= MAX_DEPTH && tree.children.length > 0) {
    lines.push(`${indent}  ${summarizeChildren(tree.children)}`);
    return;
  }

  for (const child of tree.children) {
    renderTree(child, specWidth, depth + 1, lines);
  }
}

function collectNavigateTo(nodes: Readonly<Record<string, NodeSpec>>): Array<{ id: string; target: string }> {
  const bindings: Array<{ id: string; target: string }> = [];
  for (const [id, node] of Object.entries(nodes)) {
    if (node.navigateTo) bindings.push({ id, target: node.navigateTo });
  }
  return bindings;
}

/**
 * Build a compact text representation of a DesignSpecV2 for the vision evaluator.
 *
 * Preserves: component names, types, catalog entries, text content, background tokens,
 * navigateTo targets, items arrays, and explicit pixel widths.
 *
 * Strips: layout details, overrides, shadow, border, cornerRadius, order values.
 */
export function buildEvaluationContext(spec: DesignSpecV2): string {
  const nodeCount = Object.keys(spec.nodes).length;

  if (nodeCount === 0) {
    return `Page: ${spec.screen ?? '(unknown)'} (${spec.width}px wide) — 0 nodes (empty spec)`;
  }

  const rootId = findRootId(spec.nodes);
  if (!rootId) {
    const nodeList = Object.entries(spec.nodes)
      .map(([id, n]) => `- ${formatNodeLine(id, n, spec.width)}`)
      .join('\n');
    return `Page: ${spec.screen ?? '(unknown)'} (${spec.width}px wide, ${nodeCount} nodes, no root)\n\n${nodeList}`;
  }

  const tree = buildTree(spec.nodes, rootId);

  const lines: string[] = [];
  lines.push(`Page: ${spec.screen} (${spec.width}px wide, ${nodeCount} nodes)`);
  lines.push('');
  lines.push('Component tree:');
  renderTree(tree, spec.width, 0, lines);

  const navBindings = collectNavigateTo(spec.nodes);
  if (navBindings.length > 0) {
    lines.push('');
    lines.push(`Navigation bindings: ${navBindings.length}`);
    for (const b of navBindings) {
      lines.push(`  ${b.id} → ${b.target}`);
    }
  }

  return lines.join('\n');
}
