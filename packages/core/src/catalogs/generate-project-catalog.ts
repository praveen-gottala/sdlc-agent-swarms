/**
 * @module @agentforge/core/catalogs/generate-project-catalog
 *
 * Filters the base component catalog for a specific library and applies
 * design token constraints (min_height, token binding validation).
 */

import type {
  ComponentCatalogSpec,
  ComponentCatalogEntry,
  DesignTokensSpec,
  CatalogLibraryMapping,
} from '../types/design-system.js';

/** Categories that require touch-target minimum height enforcement. */
const TOUCH_TARGET_CATEGORIES = new Set(['input', 'navigation']);

/**
 * Generate a project-specific component catalog by filtering the base catalog
 * to a single library and applying design token constraints.
 *
 * @param baseCatalog - The full base catalog with all library mappings
 * @param libraryId - The library to keep (e.g., 'shadcn', 'mui', 'chakra')
 * @param designTokens - The project's design tokens for min_height and validation
 * @returns A filtered ComponentCatalogSpec for the chosen library
 * @throws If baseCatalog has no components, libraryId is empty, or touch_targets is missing
 */
export function generateProjectCatalog(
  baseCatalog: ComponentCatalogSpec,
  libraryId: string,
  designTokens: DesignTokensSpec,
): ComponentCatalogSpec {
  // Runtime input validation (per CLAUDE.md pipeline rules)
  if (!baseCatalog || !baseCatalog.components || Object.keys(baseCatalog.components).length === 0) {
    throw new Error('generateProjectCatalog: baseCatalog has no components');
  }
  if (!libraryId || libraryId.trim() === '') {
    throw new Error('generateProjectCatalog: libraryId must be a non-empty string');
  }
  if (!designTokens?.touch_targets?.minimum_height) {
    throw new Error('generateProjectCatalog: designTokens.touch_targets.minimum_height is required');
  }

  const minHeight = designTokens.touch_targets.minimum_height;
  const filteredComponents: Record<string, ComponentCatalogEntry> = {};

  for (const [name, entry] of Object.entries(baseCatalog.components)) {
    // Filter library_mapping — keep only the chosen library's entry
    const mapping = entry.library_mapping?.[libraryId];
    const libraryMapping: Record<string, CatalogLibraryMapping> = mapping
      ? { [libraryId]: mapping }
      : {};

    // Set min_height for input/navigation categories or components that already had it
    const needsMinHeight = TOUCH_TARGET_CATEGORIES.has(entry.category) || entry.min_height !== undefined;
    const componentMinHeight = needsMinHeight ? minHeight : undefined;

    // Validate token_bindings — warn on unresolvable tokens
    if (entry.token_bindings) {
      validateTokenBindings(name, entry.token_bindings, designTokens);
    }

    filteredComponents[name] = {
      ...entry,
      ...(componentMinHeight !== undefined ? { min_height: componentMinHeight } : {}),
      library_mapping: libraryMapping,
    };
  }

  return {
    version: baseCatalog.version,
    created_by: 'agentforge-init',
    components: filteredComponents,
  };
}

/**
 * Warn (not fail) on token bindings that reference tokens not found
 * in the design tokens' semantic colors or border radii.
 */
function validateTokenBindings(
  componentName: string,
  bindings: ComponentCatalogEntry['token_bindings'],
  tokens: DesignTokensSpec,
): void {
  if (!bindings) return;

  const semanticColors = new Set(Object.keys(tokens.colors.semantic));
  const borderRadii = new Set(Object.keys(tokens.borders.radius));

  if (bindings.background && !semanticColors.has(bindings.background)) {
    console.warn(`[catalog] Component "${componentName}": token_bindings.background "${bindings.background}" not found in semantic colors`);
  }
  if (bindings.text && !semanticColors.has(bindings.text)) {
    console.warn(`[catalog] Component "${componentName}": token_bindings.text "${bindings.text}" not found in semantic colors`);
  }
  if (bindings['border-radius'] && !borderRadii.has(bindings['border-radius'])) {
    console.warn(`[catalog] Component "${componentName}": token_bindings.border-radius "${bindings['border-radius']}" not found in border radii`);
  }
}
