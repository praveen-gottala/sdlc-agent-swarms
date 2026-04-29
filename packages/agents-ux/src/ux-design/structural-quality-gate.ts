/**
 * @module @agentforge/agents-ux/ux-design/structural-quality-gate
 *
 * Standalone structural quality checks for DesignSpec pages.
 * Pure function — no LLM, no browser, no screenshot required.
 * Calls assessContainerDiversity + assessCatalogAdoption, caps total
 * deductions at MAX_STRUCTURAL_DEDUCTION.
 *
 * Used by:
 * - evaluatorNode (pipeline stage) — structural-only Phase 1
 * - evaluateDesign() (vision evaluator) — structural deductions on top of vision score
 */

import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { DesignIssue } from './design-evaluator.js';
import type { ContainerDiversityResult } from './assess-container-diversity.js';
import { assessContainerDiversity } from './assess-container-diversity.js';
import type { CatalogAdoptionResult } from './assess-catalog-adoption.js';
import { assessCatalogAdoption } from './assess-catalog-adoption.js';

export const MAX_STRUCTURAL_DEDUCTION = 20;

export interface StructuralQualityResult {
  readonly score: number;
  readonly deductions: number;
  readonly issues: readonly DesignIssue[];
  readonly containerDiversity: ContainerDiversityResult;
  readonly catalogAdoption: CatalogAdoptionResult;
}

/**
 * Run structural quality checks on a DesignSpec page.
 *
 * Checks container treatment diversity and catalog adoption ratio.
 * Returns a score (100 minus capped deductions) and any issues found.
 */
export function runStructuralQualityGate(spec: DesignSpecV2): StructuralQualityResult {
  const issues: DesignIssue[] = [];
  let rawDeductions = 0;

  const diversity = assessContainerDiversity(spec);
  if (diversity.isMonotonous && diversity.dominantTreatment) {
    rawDeductions += 10;
    issues.push({
      severity: 'major',
      component: 'DesignSpec',
      description: `All ${String(diversity.treatments.length)} top-level sections use "${diversity.dominantTreatment}" treatment. Design should mix treatments (elevated, outlined, flat, inset, separated).`,
      fix: 'Vary container treatments: use Elevated (shadow) for primary content, Outlined (border) for secondary, Flat (background) for info panels.',
      issueId: 'container-treatment-monotony',
    });
  }

  const adoption = assessCatalogAdoption(spec);
  if (adoption.isLow) {
    rawDeductions += 10;
    const suggestions = adoption.promotablePatterns
      .slice(0, 3)
      .map(p => `${p.nodeId} → ${p.suggestedCatalog}`)
      .join(', ');
    issues.push({
      severity: 'major',
      component: 'DesignSpec',
      description: `Low catalog adoption: ${String(adoption.acceleratorCount)} accelerator nodes vs ${String(adoption.catalogCount)} catalog nodes (${Math.round(adoption.catalogRatio * 100)}%). ${String(adoption.promotablePatterns.length)} nodes could use catalog entries for better semantic HTML.`,
      fix: `Use catalog entries instead of container+text composition: ${suggestions}.`,
      issueId: 'low-catalog-adoption',
    });
  }

  const deductions = Math.min(rawDeductions, MAX_STRUCTURAL_DEDUCTION);

  return {
    score: Math.max(0, 100 - deductions),
    deductions,
    issues,
    containerDiversity: diversity,
    catalogAdoption: adoption,
  };
}
