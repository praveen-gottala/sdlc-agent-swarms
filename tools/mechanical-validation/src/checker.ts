/**
 * Checker — thin adapter that delegates to the production checker in
 * @agentforge/designspec-renderer and maps between the harness's
 * DOMNodeData[] format and the production DOMLayoutData record format.
 *
 * The production implementation lives at:
 *   packages/designspec-renderer/src/renderer/browser/mechanical-fixes.ts
 */
import {
  checkMechanicalIssues,
  type MechanicalIssue,
  type DOMLayoutData,
  type DOMNodeLayout,
  type DesignSpecV2,
} from "@agentforge/designspec-renderer";
import type { DOMNodeData, CheckViolation, CheckCategory } from "./types.js";

// Re-export production thresholds for harness consumers
export {
  OVERLAP_THRESHOLD_PX,
  OVERFLOW_THRESHOLD_PX,
  COLLAPSE_HEIGHT_PX,
  BADGE_WIDTH_RATIO,
  TEXT_CLIP_TOLERANCE_PX,
} from "@agentforge/designspec-renderer";

// ── Rule name mapping ────────────────────────────────────────────────
// Production uses shorter names; harness uses longer hyphenated names.

const RULE_TO_CHECK: Record<MechanicalIssue["rule"], CheckCategory> = {
  overlap: "sibling-overlap",
  "child-overflow": "child-overflow",
  "zero-size": "zero-collapse",
  "text-clip": "text-clipping",
  "badge-oversize": "badge-oversized",
};

// ── Format adapters ──────────────────────────────────────────────────

function mapToDOMNodeLayout(node: DOMNodeData): DOMNodeLayout {
  return {
    nodeId: node.nodeId,
    dataCatalog: node.dataCatalog,
    rect: {
      x: node.rect.x,
      y: node.rect.y,
      width: node.rect.width,
      height: node.rect.height,
    },
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    textContent: node.textContent,
    parentNodeId: node.parentNodeId,
    // Build childNodeIds from the flat array
    childNodeIds: [],  // filled in below
    computed: {
      overflow: node.computedStyles.overflow,
      display: node.computedStyles.display,
      position: "static",
    },
  };
}

function mapToCheckViolation(issue: MechanicalIssue): CheckViolation {
  const check = RULE_TO_CHECK[issue.rule] ?? (issue.rule as CheckCategory);
  return {
    nodeId: issue.nodeId,
    check,
    severity: issue.autoFixable ? "warning" : "error",
    message: issue.description,
    details: issue.suggestedFix ? { suggestedFix: issue.suggestedFix } : {},
  };
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Run all mechanical checks on a harness-format DOM node array.
 * Delegates to the production checkMechanicalIssues() and maps results
 * back to the harness's CheckViolation format.
 */
export function runAllChecks(domNodes: DOMNodeData[], spec?: DesignSpecV2): CheckViolation[] {
  // Convert harness format → production format
  const layoutNodes: Record<string, DOMNodeLayout> = {};
  for (const node of domNodes) {
    layoutNodes[node.nodeId] = mapToDOMNodeLayout(node);
  }

  // Fill in childNodeIds from parentNodeId references
  for (const node of domNodes) {
    if (node.parentNodeId && layoutNodes[node.parentNodeId]) {
      layoutNodes[node.parentNodeId].childNodeIds.push(node.nodeId);
    }
  }

  const domLayout: DOMLayoutData = {
    nodes: layoutNodes,
    viewportWidth: 1440,
    viewportHeight: 900,
  };

  // Build a minimal DesignSpecV2 if not provided
  const designSpec: DesignSpecV2 = spec ?? {
    screen: "harness",
    width: 1440,
    nodes: Object.fromEntries(
      domNodes.map((n) => [
        n.nodeId,
        { parent: n.parentNodeId, order: 0 },
      ]),
    ) as DesignSpecV2["nodes"],
  };

  const issues = checkMechanicalIssues(domLayout, designSpec);
  return issues.map(mapToCheckViolation);
}
