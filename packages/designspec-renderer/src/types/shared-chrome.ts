/**
 * Shared chrome artifact (Chrome Pass) — DesignSpec v2 plus region map for LayoutShell.
 */
import type { DesignSpecV2 } from './design-spec-v2.js';

export type SharedChromeRegionKey = 'header' | 'sidebar' | 'footer';

export type SharedChromeRegionsMap = Partial<Record<SharedChromeRegionKey, readonly string[]>>;

/** Written to `agentforge/shared-chrome.json`; consumed by LayoutShell. */
export interface SharedChromeSpec extends DesignSpecV2 {
  readonly regions?: SharedChromeRegionsMap;
}
