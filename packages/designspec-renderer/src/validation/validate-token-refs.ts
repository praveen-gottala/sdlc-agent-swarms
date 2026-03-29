/**
 * @module @agentforge/designspec-renderer/validation/validate-token-refs
 * Validates that color/background token references in a DesignSpecV2 resolve
 * to values in the generated token map.
 */
import type { DesignSpecV2 } from '../types/design-spec-v2.js';
import type { CatalogMap } from '../types/catalog.js';
import type { RendererTokens } from '../types/tokens.js';
import type { ValidationResult, ValidationIssue } from '../types/validation.js';
import { buildTokenMap } from '../renderer/token-resolver.js';

/** CSS keywords and raw values that bypass token resolution. */
const PASSTHROUGH = new Set(['transparent', 'none', 'inherit', 'initial']);

/**
 * Validate that every color, background, and border_color reference in the spec
 * resolves to a value in the token map.
 *
 * @param spec - The DesignSpec to validate
 * @param catalog - The catalog map (used for catalog node defaults)
 * @param tokens - Renderer tokens to build the color map from
 * @returns Validation result with warnings for unresolvable references
 */
export function validateTokenReferences(
  spec: DesignSpecV2,
  catalog: CatalogMap,
  tokens: RendererTokens,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const colorMap = buildTokenMap(tokens);

  for (const [id, node] of Object.entries(spec.nodes)) {
    // Check direct node color references
    if (node.color) {
      checkRef(id, 'color', node.color, colorMap, issues);
    }
    if (node.background) {
      checkRef(id, 'background', node.background, colorMap, issues);
    }

    // Check catalog node overrides
    if (node.overrides) {
      const ov = node.overrides as Record<string, unknown>;
      if (typeof ov['color'] === 'string') {
        checkRef(id, 'overrides.color', ov['color'], colorMap, issues);
      }
      if (typeof ov['background'] === 'string') {
        checkRef(id, 'overrides.background', ov['background'], colorMap, issues);
      }
      if (typeof ov['border_color'] === 'string') {
        checkRef(id, 'overrides.border_color', ov['border_color'], colorMap, issues);
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

/** Check a single token reference against the color map. */
function checkRef(
  nodeId: string,
  field: string,
  ref: string,
  colorMap: Readonly<Record<string, string>>,
  issues: ValidationIssue[],
): void {
  // Skip passthrough values
  if (PASSTHROUGH.has(ref)) return;
  // Skip raw hex/rgba
  if (ref.startsWith('#') || ref.startsWith('rgba')) return;

  if (!(ref in colorMap)) {
    issues.push({
      severity: 'warning',
      rule: 'token-ref',
      message: `Node "${nodeId}" field "${field}" references token "${ref}" which is not in the token map`,
      nodeId,
    });
  }
}
