/**
 * Derive shared app chrome (TopBar, NavigationTabs, etc.) from pages.yaml + catalog.
 * See ADR-039: Chrome Pass uses this — no separate layout schema.
 */

import type { PageEntry } from '@agentforge/core';

export type SharedLayoutPosition = 'header' | 'sidebar' | 'footer';

export interface SharedChromeRegion {
  readonly position: SharedLayoutPosition;
  readonly components: readonly string[];
}

export interface SharedChrome {
  readonly components: readonly string[];
  readonly regions: readonly SharedChromeRegion[];
  readonly referencePageId: string;
}

/** Map TopBar -> top-bar for catalog lookup. */
export function componentNameToKebab(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Discover shared components across all approved page-type screens.
 * Returns component names + reference page ID. Regions are derived later
 * by `deriveRegionsFromPageSpec()` after the page design is available.
 */
export function resolveSharedComponents(
  pages: readonly PageEntry[],
): SharedChrome | null {
  const pageScreens = pages.filter(
    (p) => p.status === 'approved' && (p.screen_type ?? 'page') === 'page',
  );
  if (pageScreens.length < 2) return null;

  const componentCounts = new Map<string, number>();
  for (const page of pageScreens) {
    for (const comp of page.components ?? []) {
      componentCounts.set(comp, (componentCounts.get(comp) ?? 0) + 1);
    }
  }

  const shared = [...componentCounts.entries()]
    .filter(([, count]) => count === pageScreens.length)
    .map(([name]) => name);

  if (shared.length === 0) return null;

  return {
    components: shared,
    regions: [],
    referencePageId: pageScreens[0]!.id,
  };
}
