/**
 * Normalizes override keys in a DesignSpec to camelCase.
 *
 * LLMs generate override keys inconsistently: font_size, font-size, fontSize.
 * This function normalizes all to camelCase at write time so the verifier
 * and renderer don't need to handle multiple variants.
 */
import type { DesignSpecV2, NodeSpec } from '../types/design-spec-v2.js';

function toCamelCase(key: string): string {
  return key
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

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
    for (const [key, value] of Object.entries(node.overrides)) {
      const camel = toCamelCase(key);
      if (camel !== key) nodeChanged = true;
      normalized[camel] = value;
    }
    if (nodeChanged) {
      changed = true;
      nodes[id] = { ...node, overrides: normalized };
    } else {
      nodes[id] = node;
    }
  }
  return changed ? { ...spec, nodes } : spec;
}
