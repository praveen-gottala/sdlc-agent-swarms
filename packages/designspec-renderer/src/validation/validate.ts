/**
 * @module @agentforge/designspec-renderer/validation/validate
 * Validates a DesignSpecV2 for structural correctness.
 */
import type { DesignSpecV2 } from '../types/design-spec-v2.js';
import type { CatalogMap } from '../types/catalog.js';
import type { ValidationResult, ValidationIssue } from '../types/validation.js';

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
 */
export function validateDesignSpec(spec: DesignSpecV2, catalog: CatalogMap): ValidationResult {
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
  for (const [id, node] of Object.entries(nodes)) {
    if (node.catalog && !(node.catalog in catalog)) {
      issues.push({
        severity: 'error',
        rule: 'valid-catalog',
        message: `Node "${id}" references unknown catalog entry "${node.catalog}"`,
        nodeId: id,
      });
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

  // Rule 6: Interactive nodes meet 44px min touch target
  const INTERACTIVE_TYPES = new Set(['button', 'input', 'stepper', 'segmented-control', 'checkbox', 'select']);
  for (const [id, node] of Object.entries(nodes)) {
    if (node.catalog) {
      const entry = catalog[node.catalog];
      if (entry && INTERACTIVE_TYPES.has(entry.type)) {
        const height = (node.overrides?.['height'] as number | undefined) ?? node.height ?? entry.height ?? entry.min_height;
        if (height !== undefined && height < 44) {
          issues.push({
            severity: 'warning',
            rule: 'touch-target',
            message: `Node "${id}" (${node.catalog}) has height ${height}px — below 44px touch target minimum`,
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

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
