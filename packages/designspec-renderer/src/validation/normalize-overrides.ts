/**
 * Normalizes override keys in a DesignSpec to camelCase and promotes
 * known NodeSpec properties out of overrides into their first-class fields.
 *
 * LLMs generate override keys inconsistently: font_size, font-size, fontSize.
 * They also sometimes put first-class properties (textAlign, background,
 * radius) inside overrides instead of on the node directly. Both are fixed
 * at write time so the verifier and renderer don't need to handle variants.
 */
import type { DesignSpecV2, NodeSpec } from '../types/design-spec-v2.js';

function toCamelCase(key: string): string {
  return key
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const PROMOTABLE_TO_NODE: ReadonlySet<string> = new Set([
  'textAlign', 'typography', 'weight',
]);

export function normalizeSpecOverrides(spec: DesignSpecV2): DesignSpecV2 {
  const nodes: Record<string, NodeSpec> = {};
  let changed = false;
  for (const [id, node] of Object.entries(spec.nodes)) {
    if (!node.overrides || Object.keys(node.overrides).length === 0) {
      nodes[id] = node;
      continue;
    }
    const normalized: Record<string, unknown> = {};
    let nodeChanged = false;
    const promoted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.overrides)) {
      const camel = toCamelCase(key);
      if (camel !== key) nodeChanged = true;
      if (PROMOTABLE_TO_NODE.has(camel) && (node as unknown as Record<string, unknown>)[camel] === undefined) {
        promoted[camel] = value;
        nodeChanged = true;
      } else {
        normalized[camel] = value;
      }
    }
    if (nodeChanged) {
      changed = true;
      nodes[id] = { ...node, ...promoted, overrides: normalized };
    } else {
      nodes[id] = node;
    }
  }
  return changed ? { ...spec, nodes } : spec;
}
