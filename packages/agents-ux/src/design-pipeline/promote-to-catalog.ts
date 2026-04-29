/**
 * @module promote-to-catalog
 *
 * Deterministic post-processor that promotes accelerator nodes to catalog
 * entries when pattern-matching identifies a high-confidence structural match.
 * Runs after LLM output, before save.
 */
import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';
import { debugLog } from '@agentforge/core';

const INPUT_CATALOG_IDS = new Set([
  'input-text', 'input-currency', 'select', 'checkbox', 'radio',
  'switch', 'text-area', 'textarea', 'date-picker',
]);

type MutableNode = {
  -readonly [K in keyof NodeSpec]: NodeSpec[K] extends Readonly<Record<string, unknown>> | undefined
    ? Record<string, unknown> | undefined
    : NodeSpec[K];
};

interface PromotionResult {
  readonly spec: DesignSpecV2;
  readonly promotions: readonly { nodeId: string; from: string; to: string }[];
}

function getChildren(nodes: Record<string, NodeSpec>, parentId: string): { id: string; node: NodeSpec }[] {
  return Object.entries(nodes)
    .filter(([, n]) => n.parent === parentId)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, node]) => ({ id, node }));
}

function isHeadingTypography(typo: string | undefined): boolean {
  return !!typo && typo.startsWith('heading');
}

function cloneNode(node: NodeSpec): MutableNode {
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (v !== undefined) {
      clone[k] = typeof v === 'object' && v !== null ? JSON.parse(JSON.stringify(v)) : v;
    }
  }
  return clone as MutableNode;
}

/**
 * Promote a container + heading-text pattern to catalog: "Section".
 * Match: container whose first child is a text node with heading typography,
 * and which has 2+ total children.
 */
function tryPromoteSection(
  nodeId: string,
  node: NodeSpec,
  children: { id: string; node: NodeSpec }[],
): { promoted: MutableNode; deleteChildId: string; reindexFrom: number } | null {
  if (node.type !== 'container' || children.length < 2) return null;

  const first = children[0];
  if (first.node.type !== 'text' || !isHeadingTypography(first.node.typography)) return null;

  const promoted = cloneNode(node);
  delete (promoted as Record<string, unknown>).type;
  promoted.catalog = 'Section';
  promoted.label = first.node.content ?? first.node.label ?? '';
  promoted.overrides = { ...promoted.overrides, __promoted: true };

  return { promoted, deleteChildId: first.id, reindexFrom: 1 };
}

/**
 * Promote a container wrapping form inputs to catalog: "Form".
 * Match: container where 50%+ direct children are input catalog entries.
 */
function tryPromoteForm(
  node: NodeSpec,
  children: { id: string; node: NodeSpec }[],
): MutableNode | null {
  if (node.type !== 'container' || children.length < 2) return null;

  const inputCount = children.filter(c => c.node.catalog && INPUT_CATALOG_IDS.has(c.node.catalog)).length;
  if (inputCount / children.length < 0.5) return null;

  const promoted = cloneNode(node);
  delete (promoted as Record<string, unknown>).type;
  promoted.catalog = 'Form';
  promoted.overrides = { ...promoted.overrides, __promoted: true };

  return promoted;
}

/**
 * Promote a header node (direct child of root page) to catalog: "PageHeader".
 * Match: type: "header" whose parent is the root page node.
 */
function tryPromotePageHeader(
  node: NodeSpec,
  rootId: string | null,
  children: { id: string; node: NodeSpec }[],
): MutableNode | null {
  if (node.type !== 'header' || node.parent !== rootId) return null;

  const promoted = cloneNode(node);
  delete (promoted as Record<string, unknown>).type;
  promoted.catalog = 'PageHeader';
  promoted.overrides = { ...promoted.overrides, __promoted: true };

  const textChild = children.find(c => c.node.type === 'text' && isHeadingTypography(c.node.typography));
  if (textChild) {
    promoted.label = textChild.node.content ?? textChild.node.label ?? '';
  }

  return promoted;
}

/**
 * Promote accelerator patterns to catalog entries.
 * Pure, idempotent, preserves all properties on promoted nodes.
 */
export function promoteToCatalog(spec: DesignSpecV2): PromotionResult {
  const nodes = { ...spec.nodes } as Record<string, NodeSpec>;
  const promotions: { nodeId: string; from: string; to: string }[] = [];

  const rootId = Object.entries(nodes).find(([, n]) => n.parent === null)?.[0] ?? null;

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.catalog) continue;
    if ((node.overrides as Record<string, unknown> | undefined)?.__promoted) continue;

    const children = getChildren(nodes, nodeId);

    const sectionResult = tryPromoteSection(nodeId, node, children);
    if (sectionResult) {
      nodes[nodeId] = sectionResult.promoted as NodeSpec;
      delete nodes[sectionResult.deleteChildId];
      for (const child of children.slice(sectionResult.reindexFrom)) {
        const updated = cloneNode(nodes[child.id]);
        updated.order = updated.order - 1;
        nodes[child.id] = updated as NodeSpec;
      }
      promotions.push({ nodeId, from: 'container', to: 'Section' });
      debugLog(`promote-to-catalog: ${nodeId} container → Section (label: "${sectionResult.promoted.label}")`);
      continue;
    }

    const formResult = tryPromoteForm(node, children);
    if (formResult) {
      nodes[nodeId] = formResult as NodeSpec;
      promotions.push({ nodeId, from: 'container', to: 'Form' });
      debugLog(`promote-to-catalog: ${nodeId} container → Form`);
      continue;
    }

    const headerResult = tryPromotePageHeader(node, rootId, children);
    if (headerResult) {
      nodes[nodeId] = headerResult as NodeSpec;
      promotions.push({ nodeId, from: 'header', to: 'PageHeader' });
      debugLog(`promote-to-catalog: ${nodeId} header → PageHeader (label: "${headerResult.label ?? ''}")`);
      continue;
    }
  }

  if (promotions.length > 0) {
    debugLog(`promote-to-catalog: ${promotions.length} promotions applied`);
  }

  return {
    spec: { ...spec, nodes },
    promotions,
  };
}
