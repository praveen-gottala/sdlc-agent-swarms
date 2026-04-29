/**
 * @module @agentforge/agents-ux/ux-design/assess-catalog-adoption
 *
 * Structural post-processing: detects low catalog adoption in generated
 * DesignSpec pages — pages dominated by container+text accelerators when
 * catalog entries with dedicated renderers would produce better output.
 */

import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';

const EXCLUDED_TYPES = new Set(['page', 'divider', 'spacer']);

const INPUT_CATALOG_IDS = new Set([
  'input-text', 'input-currency', 'select', 'checkbox', 'radio',
  'switch', 'text-area', 'textarea', 'date-picker',
]);

export interface PromotablePattern {
  readonly nodeId: string;
  readonly suggestedCatalog: string;
  readonly reason: string;
}

export interface CatalogAdoptionResult {
  readonly totalCountable: number;
  readonly acceleratorCount: number;
  readonly catalogCount: number;
  readonly catalogRatio: number;
  readonly promotablePatterns: readonly PromotablePattern[];
  readonly isLow: boolean;
}

function getDirectChildren(nodes: Readonly<Record<string, NodeSpec>>, parentId: string): { id: string; node: NodeSpec }[] {
  return Object.entries(nodes)
    .filter(([, n]) => n.parent === parentId)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, node]) => ({ id, node }));
}

function isHeadingTypography(typo: string | undefined): boolean {
  return !!typo && typo.startsWith('heading');
}

function findPromotablePatterns(nodes: Readonly<Record<string, NodeSpec>>, rootId: string | null): PromotablePattern[] {
  const patterns: PromotablePattern[] = [];

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.catalog) continue;
    if ((node.overrides as Record<string, unknown> | undefined)?.__promoted) continue;

    const children = getDirectChildren(nodes, nodeId);

    if (node.type === 'container' && children.length >= 2) {
      const first = children[0];
      if (first.node.type === 'text' && isHeadingTypography(first.node.typography)) {
        patterns.push({ nodeId, suggestedCatalog: 'Section', reason: 'container with heading-text first child' });
        continue;
      }

      const inputCount = children.filter(c => c.node.catalog && INPUT_CATALOG_IDS.has(c.node.catalog)).length;
      if (inputCount / children.length >= 0.5) {
        patterns.push({ nodeId, suggestedCatalog: 'Form', reason: 'container with 50%+ input children' });
        continue;
      }
    }

    if (node.type === 'header' && node.parent === rootId) {
      patterns.push({ nodeId, suggestedCatalog: 'PageHeader', reason: 'header direct child of root' });
    }
  }

  return patterns;
}

/**
 * Assess catalog adoption for a DesignSpec page.
 *
 * Counts accelerator vs catalog nodes (excluding page/divider/spacer which
 * have no catalog equivalent), identifies promotable patterns, and flags
 * low adoption when container+text dominate AND promotable patterns exist.
 */
export function assessCatalogAdoption(spec: DesignSpecV2): CatalogAdoptionResult {
  let acceleratorCount = 0;
  let catalogCount = 0;

  const rootId = Object.entries(spec.nodes).find(([, n]) => n.parent === null)?.[0] ?? null;

  for (const node of Object.values(spec.nodes)) {
    if (node.type && EXCLUDED_TYPES.has(node.type)) continue;
    if (node.catalog) {
      catalogCount++;
    } else if (node.type) {
      acceleratorCount++;
    }
  }

  const totalCountable = acceleratorCount + catalogCount;
  const catalogRatio = totalCountable > 0 ? catalogCount / totalCountable : 0;

  const promotablePatterns = findPromotablePatterns(spec.nodes, rootId);

  const isLow = totalCountable > 0
    && acceleratorCount / totalCountable > 0.7
    && promotablePatterns.length > 0;

  return {
    totalCountable,
    acceleratorCount,
    catalogCount,
    catalogRatio,
    promotablePatterns,
    isLow,
  };
}
