/**
 * @module @agentforge/designspec-renderer/renderer/browser/mechanical-fixes
 *
 * Pure functions for detecting and fixing layout issues mechanically
 * (no LLM, no browser, no side effects). Operates on DOMLayoutData
 * extracted from the rendered page + the DesignSpec JSON.
 *
 * Tier 1 rules are auto-fixable. Tier 2 rules are report-only
 * (forwarded to vision correction as additional context).
 */
import type { DOMLayoutData, DOMNodeLayout } from './dom-extraction.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';

// ─── Threshold Constants (exported for test fixtures) ───────

/** Ignore sub-pixel overlap from browser rounding. */
export const OVERLAP_THRESHOLD_PX = 2;
/** Ignore sub-pixel overflow. */
export const OVERFLOW_THRESHOLD_PX = 2;
/** Below this height = zero-size collapse. */
export const COLLAPSE_HEIGHT_PX = 1;
/** Badge computed width / estimated text width ratio threshold. */
export const BADGE_WIDTH_RATIO = 2.5;
/** scrollWidth - clientWidth tolerance for text clipping. */
export const TEXT_CLIP_TOLERANCE_PX = 2;

/** A detected mechanical layout issue. */
export interface MechanicalIssue {
  nodeId: string;
  rule: 'overlap' | 'child-overflow' | 'zero-size' | 'text-clip' | 'badge-oversize';
  /** Tier 1 = true (auto-applied), Tier 2 = false (report-only). */
  autoFixable: boolean;
  description: string;
  /** Partial NodeSpec fix for Tier 1 issues. null for Tier 2. */
  suggestedFix: Record<string, unknown> | null;
}

/** Result of running mechanical checks (for export convenience). */
export interface MechanicalCheckResult {
  issues: MechanicalIssue[];
  tier1Count: number;
  tier2Count: number;
}

/**
 * Run all mechanical checks on extracted DOM layout + spec.
 */
export function checkMechanicalIssues(
  dom: DOMLayoutData,
  spec: DesignSpecV2,
): MechanicalIssue[] {
  const issues: MechanicalIssue[] = [];

  const nodes = Object.values(dom.nodes);

  for (const node of nodes) {
    // Tier 1: badge-oversize
    checkBadgeOversize(node, issues);

    // Tier 1: text-clip
    checkTextClip(node, spec, issues);

    // Tier 1: zero-size
    checkZeroSize(node, spec, issues);
  }

  // Tier 2: overlap (sibling pairs)
  checkOverlaps(dom, issues);

  // Tier 2: child-overflow
  checkChildOverflow(dom, issues);

  return issues;
}

/**
 * Apply auto-fixable (Tier 1) mechanical fixes to a DesignSpec.
 * Returns a new immutable spec — does not mutate the original.
 */
export function applyMechanicalFixes(
  spec: DesignSpecV2,
  issues: MechanicalIssue[],
): DesignSpecV2 {
  const tier1 = issues.filter((i) => i.autoFixable && i.suggestedFix);
  if (tier1.length === 0) return spec;

  // Deep clone to avoid mutation
  const patched: DesignSpecV2 = JSON.parse(JSON.stringify(spec));

  for (const issue of tier1) {
    const node = patched.nodes[issue.nodeId];
    if (!node) continue;

    const fix = issue.suggestedFix!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRecord = node as any;
    for (const [key, value] of Object.entries(fix)) {
      if (value === undefined) {
        delete nodeRecord[key];
      } else {
        nodeRecord[key] = value;
      }
    }
  }

  return patched;
}

// ─── Tier 1 Checks ──────────────────────────────────────────

function checkBadgeOversize(
  node: DOMNodeLayout,
  issues: MechanicalIssue[],
): void {
  const catalog = node.dataCatalog;
  if (!catalog) return;
  if (!catalog.startsWith('badge') && catalog !== 'chip') return;

  const textLen = node.textContent.length;
  if (textLen === 0) return;

  const estimatedTextWidth = textLen * 8;
  if (node.rect.width > BADGE_WIDTH_RATIO * estimatedTextWidth) {
    issues.push({
      nodeId: node.nodeId,
      rule: 'badge-oversize',
      autoFixable: true,
      description: `Badge/chip "${node.nodeId}" is ${Math.round(node.rect.width)}px wide for ${textLen}-char text (ratio ${(node.rect.width / estimatedTextWidth).toFixed(1)}x > ${BADGE_WIDTH_RATIO}x threshold)`,
      suggestedFix: { width: undefined },
    });
  }
}

function checkTextClip(
  node: DOMNodeLayout,
  spec: DesignSpecV2,
  issues: MechanicalIssue[],
): void {
  const overflow = node.scrollWidth - node.clientWidth;
  if (overflow <= TEXT_CLIP_TOLERANCE_PX) return;

  issues.push({
    nodeId: node.nodeId,
    rule: 'text-clip',
    autoFixable: true,
    description: `Text clipped in "${node.nodeId}": scrollWidth(${node.scrollWidth}) - clientWidth(${node.clientWidth}) = ${overflow}px`,
    suggestedFix: { width: 'fill' },
  });
}

function checkZeroSize(
  node: DOMNodeLayout,
  spec: DesignSpecV2,
  issues: MechanicalIssue[],
): void {
  const hasContent = node.textContent.length > 0 || node.childNodeIds.length > 0;
  if (!hasContent) return;

  if (node.rect.width < COLLAPSE_HEIGHT_PX || node.rect.height < COLLAPSE_HEIGHT_PX) {
    const fix: Record<string, unknown> = {};
    if (node.rect.width < COLLAPSE_HEIGHT_PX) fix.width = undefined;
    if (node.rect.height < COLLAPSE_HEIGHT_PX) fix.height = undefined;

    issues.push({
      nodeId: node.nodeId,
      rule: 'zero-size',
      autoFixable: true,
      description: `Zero-size element "${node.nodeId}": ${Math.round(node.rect.width)}x${Math.round(node.rect.height)}px but has content`,
      suggestedFix: fix,
    });
  }
}

// ─── Tier 2 Checks ──────────────────────────────────────────

function checkOverlaps(
  dom: DOMLayoutData,
  issues: MechanicalIssue[],
): void {
  const nodes = Object.values(dom.nodes);

  // Group by parent
  const byParent = new Map<string, DOMNodeLayout[]>();
  for (const node of nodes) {
    const parentId = node.parentNodeId ?? '__root__';
    let siblings = byParent.get(parentId);
    if (!siblings) {
      siblings = [];
      byParent.set(parentId, siblings);
    }
    siblings.push(node);
  }

  // Check sibling pairs for overlap
  for (const siblings of byParent.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i].rect;
        const b = siblings[j].rect;

        const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

        if (overlapX > OVERLAP_THRESHOLD_PX && overlapY > OVERLAP_THRESHOLD_PX) {
          issues.push({
            nodeId: siblings[i].nodeId,
            rule: 'overlap',
            autoFixable: false,
            description: `Siblings "${siblings[i].nodeId}" and "${siblings[j].nodeId}" overlap by ${Math.round(overlapX)}x${Math.round(overlapY)}px`,
            suggestedFix: null,
          });
        }
      }
    }
  }
}

function checkChildOverflow(
  dom: DOMLayoutData,
  issues: MechanicalIssue[],
): void {
  for (const node of Object.values(dom.nodes)) {
    if (node.childNodeIds.length === 0) continue;

    const parentRect = node.rect;

    for (const childId of node.childNodeIds) {
      const child = dom.nodes[childId];
      if (!child) continue;

      const childRect = child.rect;

      const overflowRight = (childRect.x + childRect.width) - (parentRect.x + parentRect.width);
      const overflowBottom = (childRect.y + childRect.height) - (parentRect.y + parentRect.height);
      const overflowLeft = parentRect.x - childRect.x;
      const overflowTop = parentRect.y - childRect.y;

      const maxOverflow = Math.max(overflowRight, overflowBottom, overflowLeft, overflowTop);

      if (maxOverflow > OVERFLOW_THRESHOLD_PX) {
        const parts: string[] = [];
        if (overflowRight > OVERFLOW_THRESHOLD_PX) parts.push(`right:${Math.round(overflowRight)}px`);
        if (overflowBottom > OVERFLOW_THRESHOLD_PX) parts.push(`bottom:${Math.round(overflowBottom)}px`);
        if (overflowLeft > OVERFLOW_THRESHOLD_PX) parts.push(`left:${Math.round(overflowLeft)}px`);
        if (overflowTop > OVERFLOW_THRESHOLD_PX) parts.push(`top:${Math.round(overflowTop)}px`);

        issues.push({
          nodeId: child.nodeId,
          rule: 'child-overflow',
          autoFixable: false,
          description: `Child "${child.nodeId}" overflows parent "${node.nodeId}" by ${parts.join(', ')}`,
          suggestedFix: null,
        });
      }
    }
  }
}
