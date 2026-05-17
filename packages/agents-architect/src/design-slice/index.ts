/**
 * @module @agentforge/agents-architect/design-slice
 *
 * DesignSpec slice resolution functions for the DesignSliceStrategy enum.
 * Production code consumed by M4 Implementer and M3.6 eval harness.
 *
 * Two strategies narrow a full DesignSpecV2 to reduce token load:
 *   - labels-only: retains content fields (labels, values, bindings) but drops layout/visual
 *   - structure-only: retains only the node tree skeleton (parent/order/type/catalog)
 */

import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';

/** Fields retained by extractLabelsAndBindings — content + identity. */
const LABELS_AND_BINDINGS_KEYS: ReadonlySet<keyof NodeSpec> = new Set<keyof NodeSpec>([
  'parent',
  'order',
  'type',
  'catalog',
  'label',
  'content',
  'value',
  'placeholder',
  'options',
  'navigateTo',
  'items',
]);

/** Fields retained by extractStructure — tree skeleton only. */
const STRUCTURE_KEYS: ReadonlySet<keyof NodeSpec> = new Set<keyof NodeSpec>([
  'parent',
  'order',
  'type',
  'catalog',
]);

function pickNodeFields(
  node: NodeSpec,
  allowedKeys: ReadonlySet<keyof NodeSpec>,
): NodeSpec {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    if (allowedKeys.has(key as keyof NodeSpec)) {
      result[key] = node[key as keyof NodeSpec];
    }
  }
  return result as unknown as NodeSpec;
}

/**
 * Slice a DesignSpecV2 to retain only content fields per node.
 * Keeps: parent, order, type, catalog, label, content, value, placeholder,
 * options, navigateTo, items. Drops: layout, width, height, typography,
 * color, weight, background, shadow, radius, overrides.
 *
 * ~30-40% of original token size.
 */
export function extractLabelsAndBindings(spec: DesignSpecV2): DesignSpecV2 {
  const slicedNodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    slicedNodes[id] = pickNodeFields(node, LABELS_AND_BINDINGS_KEYS);
  }
  return {
    screen: spec.screen,
    width: spec.width,
    nodes: slicedNodes,
    ...(spec.screenType ? { screenType: spec.screenType } : {}),
    ...(spec.regions ? { regions: spec.regions } : {}),
  };
}

/**
 * Slice a DesignSpecV2 to retain only the tree skeleton per node.
 * Keeps: parent, order, type, catalog. Drops everything else.
 *
 * ~15-20% of original token size.
 */
export function extractStructure(spec: DesignSpecV2): DesignSpecV2 {
  const slicedNodes: Record<string, NodeSpec> = {};
  for (const [id, node] of Object.entries(spec.nodes)) {
    slicedNodes[id] = pickNodeFields(node, STRUCTURE_KEYS);
  }
  return {
    screen: spec.screen,
    width: spec.width,
    nodes: slicedNodes,
    ...(spec.screenType ? { screenType: spec.screenType } : {}),
    ...(spec.regions ? { regions: spec.regions } : {}),
  };
}
