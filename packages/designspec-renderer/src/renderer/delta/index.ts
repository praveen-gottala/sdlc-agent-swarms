/**
 * @module delta
 * Visual delta renderer — renders a DesignSpecV2 + DesignSpecDelta
 * with semantic highlighting on added, modified, and removed regions.
 */
import type { DesignSpecV2, NodeSpec } from '../../types/design-spec-v2.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';
import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';
import type { DesignSpecDelta } from './delta-types.js';
import { deltaApply } from './delta-utils.js';
import { renderToJSX } from '../react/index.js';
export type { DesignSpecDelta, ReorderEntry, DeltaApplyResult } from './delta-types.js';
export { deltaApply, deltaCompute } from './delta-utils.js';
export { DELTA_HIGHLIGHT_CSS } from './highlight-styles.js';

/* ─── Public types ───────────────────────────────────── */

/** Highlight style presets or custom definition. */
export type HighlightStyle =
  | 'mint' | 'green'
  | 'amber' | 'yellow'
  | 'red-dashed' | 'red-ghost'
  | { outline: string; fill: string; opacity?: number };

/** Options for renderDelta. */
export interface DeltaRenderOptions {
  mode?: 'overlay' | 'side-by-side' | 'slider';
  highlighting?: {
    added?: HighlightStyle;
    modified?: HighlightStyle;
    removed?: HighlightStyle;
  };
  annotations?: boolean;
  hoverDiff?: boolean;
  componentName?: string;
}

/** A field-level difference on a modified node. */
export interface FieldDiff {
  readonly field: string;
  readonly before: unknown;
  readonly after: unknown;
}

/** A change region in the rendered output. */
export interface ChangeRegion {
  readonly nodeId: string;
  readonly op: 'added' | 'modified' | 'removed' | 'reordered';
  readonly description: string;
  readonly fieldDiffs?: readonly FieldDiff[];
}

/** Summary metadata for the delta render. */
export interface DeltaRenderMetadata {
  readonly addedCount: number;
  readonly modifiedCount: number;
  readonly removedCount: number;
  readonly reorderedCount: number;
  readonly totalNodeCount: number;
  readonly estimatedRenderComplexity: 'low' | 'medium' | 'high';
}

/** Output of renderDelta. */
export interface DeltaRenderOutput {
  readonly jsx: string;
  readonly changeRegions: readonly ChangeRegion[];
  readonly metadata: DeltaRenderMetadata;
}

/* ─── Core render function ───────────────────────────── */

/**
 * Render a visual delta: existing spec + delta → JSX with highlight markup.
 * Phase A implements overlay mode only.
 */
export function renderDelta(
  existingSpec: DesignSpecV2,
  delta: DesignSpecDelta,
  tokens: RendererTokens,
  catalog: CatalogMap,
  options?: DeltaRenderOptions,
): Result<DeltaRenderOutput> {
  const mode = options?.mode ?? 'overlay';
  if (mode !== 'overlay') {
    return Err({
      code: 'NOT_IMPLEMENTED',
      message: `Mode "${mode}" not implemented in Phase A`,
    });
  }

  const showAnnotations = options?.annotations !== false;

  // 1. Apply delta to produce the merged spec
  const applyResult = deltaApply(existingSpec, delta);
  if (!applyResult.ok) return applyResult;
  const appliedSpec = applyResult.value;

  // 2. Build sets for classification
  const addedIds = new Set(Object.keys(delta.added));
  const modifiedIds = new Set(Object.keys(delta.modified));
  const removedIds = new Set(delta.removed);
  const reorderedIds = new Set(delta.reordered.map(r => r.nodeId));

  // 3. Build a combined spec: applied nodes + removed nodes in their original positions.
  //    This ensures removed nodes render in context alongside surviving content.
  const combinedNodes: Record<string, NodeSpec> = { ...appliedSpec.nodes };
  for (const id of removedIds) {
    if (existingSpec.nodes[id]) {
      combinedNodes[id] = existingSpec.nodes[id];
    }
  }
  const combinedSpec: DesignSpecV2 = { ...appliedSpec, nodes: combinedNodes };

  // 4. Render the combined spec (with data-node-id injected by the builder)
  const renderResult = renderToJSX(combinedSpec, tokens, catalog);
  let jsx = renderResult.jsx;

  // 5. Wrap nodes with highlight markup via post-processing
  jsx = applyHighlightWrapping(jsx, addedIds, modifiedIds, removedIds, reorderedIds, showAnnotations);

  // 6. Build change regions
  const changeRegions = buildChangeRegions(existingSpec, delta, addedIds, modifiedIds, removedIds, reorderedIds);

  // 7. Build metadata
  const totalNodeCount = Object.keys(combinedSpec.nodes).length;
  const metadata: DeltaRenderMetadata = {
    addedCount: addedIds.size,
    modifiedCount: modifiedIds.size,
    removedCount: removedIds.size,
    reorderedCount: reorderedIds.size,
    totalNodeCount,
    estimatedRenderComplexity: totalNodeCount <= 50 ? 'low' : totalNodeCount <= 150 ? 'medium' : 'high',
  };

  return Ok({
    jsx,
    changeRegions,
    metadata,
  });
}

/* ─── Highlight wrapping ─────────────────────────────── */

function applyHighlightWrapping(
  jsx: string,
  addedIds: Set<string>,
  modifiedIds: Set<string>,
  removedIds: Set<string>,
  reorderedIds: Set<string>,
  showAnnotations: boolean,
): string {
  // Find all data-node-id attributes and wrap their parent elements
  return jsx.replace(
    /(<\w+)([^>]*data-node-id="([^"]+)"[^>]*>)/g,
    (match, tagStart: string, rest: string, nodeId: string) => {
      let highlightClass = '';
      let badgeHtml = '';
      let dataOp = '';

      if (addedIds.has(nodeId)) {
        highlightClass = 'r10-highlight r10-added';
        dataOp = 'added';
        if (showAnnotations) badgeHtml = '<span class="r10-badge r10-badge-added">+ Added</span>';
      } else if (modifiedIds.has(nodeId)) {
        highlightClass = 'r10-highlight r10-modified';
        dataOp = 'modified';
        if (showAnnotations) badgeHtml = '<span class="r10-badge r10-badge-modified">~ Modified</span>';
      } else if (removedIds.has(nodeId)) {
        highlightClass = 'r10-highlight r10-removed';
        dataOp = 'removed';
        if (showAnnotations) badgeHtml = '<span class="r10-badge r10-badge-removed">&minus; Removed</span>';
      } else if (reorderedIds.has(nodeId)) {
        highlightClass = 'r10-highlight r10-reordered';
        dataOp = 'reordered';
        if (showAnnotations) badgeHtml = '<span class="r10-badge r10-badge-reordered">↕ Reordered</span>';
      }

      if (!highlightClass) return match;

      // Inject highlight class and data-delta-op into the existing tag
      const classMatch = rest.match(/className="([^"]*)"/);
      let modifiedRest = rest;
      if (classMatch) {
        modifiedRest = rest.replace(
          `className="${classMatch[1]}"`,
          `className="${classMatch[1]} ${highlightClass}"`,
        );
      } else {
        modifiedRest = rest.replace('>', ` className="${highlightClass}">`);
        // Re-insert the closing > since we consumed it
        if (!modifiedRest.endsWith('>')) modifiedRest += '>';
      }

      // Add data-delta-op attribute
      modifiedRest = modifiedRest.replace(
        /data-node-id="/,
        `data-delta-op="${dataOp}" data-node-id="`,
      );

      return `${tagStart}${modifiedRest}${badgeHtml ? `\n${badgeHtml}` : ''}`;
    },
  );
}

/* ─── Change regions ─────────────────────────────────── */

/**
 * Compute field-level diff between existing and partial NodeSpec.
 * Returns only fields that actually differ.
 */
export function computeFieldDiff(
  existing: NodeSpec,
  partial: Partial<NodeSpec>,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const [field, value] of Object.entries(partial)) {
    const existingVal = (existing as unknown as Record<string, unknown>)[field];
    if (existingVal !== value) {
      diffs.push({ field, before: existingVal, after: value });
    }
  }
  return diffs;
}

function buildChangeRegions(
  existingSpec: DesignSpecV2,
  delta: DesignSpecDelta,
  addedIds: Set<string>,
  modifiedIds: Set<string>,
  removedIds: Set<string>,
  reorderedIds: Set<string>,
): ChangeRegion[] {
  const regions: ChangeRegion[] = [];

  for (const nodeId of addedIds) {
    const node = delta.added[nodeId];
    regions.push({
      nodeId,
      op: 'added',
      description: `Added ${node.type ?? node.catalog ?? 'node'}`,
    });
  }

  for (const nodeId of modifiedIds) {
    const existingNode = existingSpec.nodes[nodeId];
    const partial = delta.modified[nodeId];
    const fieldDiffs = existingNode ? computeFieldDiff(existingNode, partial) : [];
    regions.push({
      nodeId,
      op: 'modified',
      description: `Modified ${existingNode?.type ?? existingNode?.catalog ?? 'node'}`,
      fieldDiffs,
    });
  }

  for (const nodeId of removedIds) {
    const node = existingSpec.nodes[nodeId];
    regions.push({
      nodeId,
      op: 'removed',
      description: `Removed ${node?.type ?? node?.catalog ?? 'node'}`,
    });
  }

  for (const { nodeId } of delta.reordered) {
    if (!modifiedIds.has(nodeId)) {
      regions.push({
        nodeId,
        op: 'reordered',
        description: `Reordered ${existingSpec.nodes[nodeId]?.type ?? 'node'}`,
      });
    }
  }

  return regions;
}

