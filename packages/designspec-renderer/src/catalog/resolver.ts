/**
 * @module @agentforge/designspec-renderer/catalog/resolver
 * Resolves a NodeSpec against the catalog to produce a ResolvedNode.
 */
import type { NodeSpec } from '../types/design-spec-v2.js';
import type { CatalogEntry, CatalogMap, ResolvedNode } from '../types/catalog.js';

/** Maximum depth for extends chains to prevent infinite loops. */
const MAX_EXTENDS_DEPTH = 5;

/**
 * Resolve an extends chain, merging parent entries.
 * Guards against circular extends with a visited set and max depth.
 */
function resolveExtends(entryId: string, catalog: CatalogMap): CatalogEntry {
  const current = catalog[entryId];
  if (!current) return current;

  const visited = new Set<string>([entryId]);
  let depth = 0;
  let merged: Record<string, unknown> = { ...current };
  let nextParentId = current.extends;

  while (nextParentId && typeof nextParentId === 'string' && depth < MAX_EXTENDS_DEPTH) {
    if (visited.has(nextParentId)) break; // Circular reference guard
    visited.add(nextParentId);

    const parent = catalog[nextParentId];
    if (!parent) break; // Parent not found

    // Parent is the base, current overrides
    merged = { ...parent, ...merged };
    // Follow the parent's extends chain, not the merged result
    nextParentId = parent.extends;
    depth++;
  }

  // Remove extends from the resolved entry
  delete merged.extends;
  return merged as CatalogEntry;
}

/**
 * Resolve a single node against the catalog.
 * - Accelerators (type field) pass through with no catalog lookup.
 * - Differentiators (catalog field) merge: catalog defaults <- extends chain <- node overrides
 */
export function resolveNode(nodeId: string, node: NodeSpec, catalog: CatalogMap): ResolvedNode {
  // Accelerator — no catalog lookup
  if (node.type) {
    return {
      id: nodeId,
      parent: node.parent,
      order: node.order,
      resolved: true,
      type: node.type,
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
      shadow: node.shadow,
      radius: node.radius,
      textAlign: node.textAlign,
      overrides: node.overrides,
      items: node.items,
    };
  }

  // Differentiator — catalog lookup
  const catalogId = node.catalog;
  if (!catalogId) {
    // Neither type nor catalog — return unresolved
    return {
      id: nodeId,
      parent: node.parent,
      order: node.order,
      resolved: false,
    };
  }

  let rawEntry = catalog[catalogId];
  // Track which catalog ID we actually found data for (may differ from the original)
  let dataSourceId = catalogId;
  if (!rawEntry) {
    // Fuzzy match: progressively strip last segment to find a base entry.
    // "data-table-compact-striped" → "data-table-compact" → "data-table" → "data"
    let candidate = catalogId;
    while (!rawEntry) {
      const lastDash = candidate.lastIndexOf('-');
      if (lastDash <= 0) break;
      candidate = candidate.substring(0, lastDash);
      if (catalog[candidate]) {
        rawEntry = catalog[candidate];
        dataSourceId = candidate;
      }
    }
    if (!rawEntry) {
      // No base match at any level — return unresolved
      return {
        id: nodeId,
        parent: node.parent,
        order: node.order,
        resolved: false,
        catalogId,
      };
    }
  }

  // Resolve extends chain using the entry we actually found
  const entry = resolveExtends(dataSourceId, catalog);

  // Merge: catalog defaults <- node overrides
  const overrides = node.overrides ?? {};

  return {
    id: nodeId,
    parent: node.parent,
    order: node.order,
    resolved: true,
    // Keep original catalogId for renderer lookup (e.g., "button-destructive")
    catalogId,
    catalogEntry: entry,
    label: node.label,
    content: node.content,
    value: node.value,
    placeholder: node.placeholder,
    helper: node.helper,
    title: node.title,
    options: node.options,
    layout: node.layout,
    width: (overrides.width as number | 'fill' | undefined) ?? node.width ?? entry.width,
    height: (overrides.height as number | undefined) ?? node.height ?? entry.height,
    typography: (overrides.typography as string | undefined) ?? node.typography ?? entry.text_typography,
    color: (overrides.color as string | undefined) ?? node.color ?? entry.text_color,
    weight: (overrides.weight as number | undefined) ?? (overrides.text_weight as number | undefined) ?? node.weight ?? entry.text_weight,
    background: (overrides.background as string | undefined) ?? node.background ?? entry.background,
    radius: (overrides.radius as number | undefined) ?? node.radius ?? entry.radius,
    border_color: (overrides.border_color as string | undefined) ?? entry.border_color,
    border_width: (overrides.border_width as number | undefined) ?? entry.border_width,
    shadow: (overrides.shadow as string | undefined) ?? node.shadow ?? entry.shadow,
    textAlign: (overrides.textAlign as 'left' | 'center' | 'right' | undefined) ?? node.textAlign,
    padding: entry.padding,
    padding_x: entry.padding_x,
    padding_y: entry.padding_y,
    overrides: node.overrides,
    items: node.items,
  };
}
