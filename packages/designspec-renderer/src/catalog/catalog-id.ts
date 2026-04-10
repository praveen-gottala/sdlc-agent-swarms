/**
 * PascalCase / camelCase catalog names from LLM output must match kebab-case
 * switch arms in DesignSpecRenderer (e.g. "NavigationBar" → "navigation-bar").
 * The resolver uses the same transform for catalog map lookup.
 *
 * Keep this in one module so resolver + renderer cannot drift.
 */
export function normalizeCatalogIdToKebab(catalogId: string): string {
  return catalogId
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
