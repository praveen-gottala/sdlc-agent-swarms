/**
 * @module @agentforge/designspec-renderer/validation/validate
 * Validates a DesignSpecV2 for structural correctness.
 */
import type { DesignSpecV2 } from '../types/design-spec-v2.js';
import type { CatalogMap } from '../types/catalog.js';
import type { ValidationResult, ValidationIssue } from '../types/validation.js';
import type { RendererTokens } from '../types/tokens.js';

/**
 * Validate a DesignSpecV2 for structural correctness.
 * Runs 7 validation rules and returns all issues found.
 *
 * Rules:
 * 1. Exactly one root node (parent === null)
 * 2. All parent references point to existing nodes
 * 3. No orphan cycles (walk parent chain, detect revisits)
 * 4. All catalog references are valid entries in the CatalogMap
 * 5. Each node has type XOR catalog (both = warning, neither = error)
 * 6. Interactive nodes meet 44px min touch target (warning)
 * 7. No sibling order gaps within parent groups (warning)
 * 8. Catalog nodes have all required_fields present (warning)
 * 9. Grid layout requires valid columns (warning)
 */
export function validateDesignSpec(spec: DesignSpecV2, catalog: CatalogMap, tokens?: RendererTokens): ValidationResult {
  const issues: ValidationIssue[] = [];
  const nodes = spec.nodes;

  // Rule 1: Exactly one root node
  const rootIds = Object.entries(nodes)
    .filter(([_, n]) => n.parent === null)
    .map(([id]) => id);

  if (rootIds.length === 0) {
    issues.push({
      severity: 'error',
      rule: 'single-root',
      message: 'No root node found — exactly one node must have parent === null',
    });
  } else if (rootIds.length > 1) {
    issues.push({
      severity: 'error',
      rule: 'single-root',
      message: `Multiple root nodes found: ${rootIds.join(', ')}`,
    });
  }

  // Rule 2: All parent references point to existing nodes
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent !== null && !(node.parent in nodes)) {
      issues.push({
        severity: 'error',
        rule: 'valid-parent',
        message: `Node "${id}" references nonexistent parent "${node.parent}"`,
        nodeId: id,
      });
    }
  }

  // Rule 3: No cycles — walk parent chain from every node, detect revisits
  for (const [startId] of Object.entries(nodes)) {
    const visited = new Set<string>();
    let current: string | null = startId;
    while (current !== null) {
      if (visited.has(current)) {
        issues.push({
          severity: 'error',
          rule: 'no-cycles',
          message: `Cycle detected: node "${startId}" has a cycle through "${current}"`,
          nodeId: startId,
        });
        break;
      }
      visited.add(current);
      current = nodes[current]?.parent ?? null;
    }
  }

  // Rule 4: All catalog references are valid entries
  // Falls back to base component match: "button-destructive" → "button" exists → warning, not error
  // Recursively strips segments: "data-table-compact-striped" → "data-table-compact" → "data-table"
  for (const [id, node] of Object.entries(nodes)) {
    if (node.catalog && !(node.catalog in catalog)) {
      let baseId: string | null = null;
      let candidate = node.catalog;
      while (true) {
        const lastDash = candidate.lastIndexOf('-');
        if (lastDash <= 0) break;
        candidate = candidate.substring(0, lastDash);
        if (candidate in catalog) {
          baseId = candidate;
          break;
        }
      }
      if (baseId) {
        issues.push({
          severity: 'warning',
          rule: 'valid-catalog',
          message: `Node "${id}" references "${node.catalog}" which is not in catalog — will fall back to base entry "${baseId}"`,
          nodeId: id,
        });
      } else {
        issues.push({
          severity: 'error',
          rule: 'valid-catalog',
          message: `Node "${id}" references unknown catalog entry "${node.catalog}"`,
          nodeId: id,
        });
      }
    }
  }

  // Rule 5: type XOR catalog
  for (const [id, node] of Object.entries(nodes)) {
    if (node.type && node.catalog) {
      issues.push({
        severity: 'warning',
        rule: 'type-xor-catalog',
        message: `Node "${id}" has both type and catalog — type takes precedence`,
        nodeId: id,
      });
    } else if (!node.type && !node.catalog) {
      issues.push({
        severity: 'error',
        rule: 'type-xor-catalog',
        message: `Node "${id}" has neither type nor catalog — one is required`,
        nodeId: id,
      });
    }
  }

  // Rule 6: Interactive nodes meet min touch target (token-driven, default 44px)
  const minTouchTarget = tokens?.touch_targets?.minimum_height ?? 44;
  const INTERACTIVE_TYPES = new Set(['button', 'input', 'stepper', 'segmented-control', 'checkbox', 'select']);
  for (const [id, node] of Object.entries(nodes)) {
    if (node.catalog) {
      const entry = catalog[node.catalog];
      if (entry && INTERACTIVE_TYPES.has(entry.type)) {
        const height = (node.overrides?.['height'] as number | undefined) ?? node.height ?? entry.height ?? entry.min_height;
        if (height !== undefined && height < minTouchTarget) {
          issues.push({
            severity: 'warning',
            rule: 'touch-target',
            message: `Node "${id}" (${node.catalog}) has height ${height}px — below ${minTouchTarget}px touch target minimum`,
            nodeId: id,
          });
        }
      }
    }
  }

  // Rule 7: No sibling order gaps within parent groups
  const childrenByParent = new Map<string, Array<{ id: string; order: number }>>();
  for (const [id, node] of Object.entries(nodes)) {
    if (node.parent !== null) {
      const siblings = childrenByParent.get(node.parent) ?? [];
      siblings.push({ id, order: node.order });
      childrenByParent.set(node.parent, siblings);
    }
  }
  for (const [parentId, children] of childrenByParent) {
    const sorted = [...children].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].order !== i) {
        issues.push({
          severity: 'warning',
          rule: 'order-gaps',
          message: `Children of "${parentId}" have order gaps — expected 0..${sorted.length - 1}, got ${sorted.map(s => s.order).join(',')}`,
        });
        break; // One warning per parent group is enough
      }
    }
  }

  // Rule 9: Grid layout must have columns
  for (const [id, node] of Object.entries(nodes)) {
    if (node.layout?.display === 'grid') {
      if (!node.layout.columns || node.layout.columns < 1 || !Number.isInteger(node.layout.columns)) {
        issues.push({
          severity: 'warning',
          rule: 'grid-columns',
          message: `Node "${id}" has layout.display: "grid" but missing or invalid layout.columns — grid will not render correctly`,
          nodeId: id,
        });
      }
    }
  }

  // Rule 8: Catalog nodes have all required_fields
  for (const [id, node] of Object.entries(nodes)) {
    if (node.catalog && node.catalog in catalog) {
      const entry = catalog[node.catalog];
      const requiredFields = entry.required_fields;
      if (requiredFields) {
        for (const field of requiredFields) {
          const hasField = (node as unknown as Record<string, unknown>)[field] !== undefined
            || (node.overrides && field in node.overrides);
          if (!hasField) {
            issues.push({
              severity: 'warning',
              rule: 'required-fields',
              message: `Node "${id}" (${node.catalog}) is missing required field "${field}"`,
              nodeId: id,
            });
          }
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
