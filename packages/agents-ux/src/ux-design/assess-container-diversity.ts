/**
 * @module @agentforge/agents-ux/ux-design/assess-container-diversity
 *
 * Structural post-processing: classifies container treatments and detects
 * visual monotony in generated DesignSpec pages.
 */

import type { DesignSpecV2, NodeSpec } from '@agentforge/designspec-renderer';

export type ContainerTreatment = 'elevated' | 'outlined' | 'flat' | 'inset' | 'separated' | 'bare';

export interface ContainerDiversityResult {
  readonly treatments: readonly { readonly nodeId: string; readonly treatment: ContainerTreatment }[];
  readonly isMonotonous: boolean;
  readonly dominantTreatment: ContainerTreatment | null;
}

const EXCLUDED_TYPES = new Set(['header', 'divider', 'spacer', 'text']);

/**
 * Classify a node's container treatment based on its visual properties.
 *
 * Priority (first match wins):
 * 1. shadow → elevated (shadow dominates even if border present)
 * 2. border + secondary background → inset
 * 3. border → outlined
 * 4. borderBottom → separated
 * 5. secondary background → flat
 * 6. none of the above → bare
 */
export function classifyContainerTreatment(node: NodeSpec): ContainerTreatment {
  const hasShadow = !!node.shadow;
  const overrides = node.overrides ?? {};
  const hasBorder = typeof overrides['border'] === 'string' && overrides['border'] !== '';
  const hasBorderBottom = typeof overrides['borderBottom'] === 'string' && overrides['borderBottom'] !== '';
  const hasSecondaryBg = typeof node.background === 'string' && node.background.includes('secondary');

  if (hasShadow) return 'elevated';
  if (hasBorder && hasSecondaryBg) return 'inset';
  if (hasBorder) return 'outlined';
  if (hasBorderBottom) return 'separated';
  if (hasSecondaryBg) return 'flat';
  return 'bare';
}

/**
 * Assess container treatment diversity for a DesignSpec page.
 *
 * Inspects top-level content sections (direct children of root, excluding
 * header/divider/spacer/text) and reports whether all sections use the
 * same treatment.
 *
 * @returns isMonotonous: true if 3+ sections all share one treatment
 */
export function assessContainerDiversity(spec: DesignSpecV2): ContainerDiversityResult {
  const topLevelSections: { nodeId: string; node: NodeSpec }[] = [];

  for (const [nodeId, node] of Object.entries(spec.nodes)) {
    if (nodeId === 'root') continue;
    if (node.parent !== 'root') continue;
    if (node.type && EXCLUDED_TYPES.has(node.type)) continue;
    topLevelSections.push({ nodeId, node });
  }

  const treatments = topLevelSections.map(({ nodeId, node }) => ({
    nodeId,
    treatment: classifyContainerTreatment(node),
  }));

  if (treatments.length < 3) {
    return { treatments, isMonotonous: false, dominantTreatment: null };
  }

  const first = treatments[0].treatment;
  const allSame = treatments.every((t) => t.treatment === first);

  return {
    treatments,
    isMonotonous: allSame,
    dominantTreatment: allSame ? first : null,
  };
}
