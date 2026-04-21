/**
 * @module @agentforge/core/config/viewport-resolver
 *
 * Resolves the viewport widths for design generation using a priority chain:
 * 1. CLI --width flag (highest)
 * 2. Screen type default (modal: 560, drawer: 320, sheet: page default)
 * 3. Per-page viewports from pages.yaml
 * 4. Design config from agentforge.yaml (responsive_breakpoints / primary_viewport)
 * 5. Default [1440] (fallback)
 *
 * Follows the same pattern as model-resolver.ts.
 */

import type { DesignConfig, ScreenType } from '../types/index.js';
import { debugLog, logDefaults } from '../debug-log.js';

/** Default viewport widths per screen type. */
const SCREEN_TYPE_VIEWPORTS: Readonly<Record<Exclude<ScreenType, 'page'>, number>> = {
  modal: 560,
  drawer: 320,
  sheet: -1, // sentinel: uses the page default chain
};

/** Standard breakpoints for desktop-first responsive design. */
export const STANDARD_BREAKPOINTS_DESKTOP_FIRST: readonly number[] = [1440, 768, 375];

/** Standard breakpoints for mobile-first responsive design. */
export const STANDARD_BREAKPOINTS_MOBILE_FIRST: readonly number[] = [375, 768, 1440];

/** Default viewport when nothing is configured. */
const DEFAULT_VIEWPORT = 1440;

/** Input parameters for viewport resolution. */
export interface ResolveViewportsInput {
  /** CLI --width flag value (highest priority). */
  readonly cliWidth?: number;
  /** Screen type (page/modal/drawer/sheet) — determines default viewport for overlays. */
  readonly screenType?: ScreenType;
  /** Per-page viewports from pages.yaml. */
  readonly pageViewports?: readonly number[];
  /** Design config section from agentforge.yaml. */
  readonly designConfig?: DesignConfig;
}

/**
 * Resolve the viewport widths for design generation.
 *
 * Priority chain:
 * 1. `cliWidth` set → `[cliWidth]`
 * 2. `screenType` is modal/drawer/sheet → screen-type default (modal: 560, drawer: 320, sheet: page default)
 * 3. `pageViewports` set and non-empty → `pageViewports`
 * 4. `designConfig.responsive_breakpoints` is `true` → standard breakpoints based on `layout_strategy`
 * 5. `designConfig.responsive_breakpoints` is a non-empty array → that array
 * 6. `designConfig.responsive_breakpoints` is `false`/missing → `[designConfig.primary_viewport ?? 1440]`
 * 7. Nothing set → `[1440]`
 *
 * @returns Array of viewport widths in generation order
 */
export function resolveViewports(input: ResolveViewportsInput): readonly number[] {
  const { cliWidth, screenType, pageViewports, designConfig } = input;

  // 1. CLI --width flag (highest priority)
  if (cliWidth !== undefined && cliWidth > 0) {
    return [cliWidth];
  }

  // 2. Screen type defaults (modal/drawer/sheet override page viewports)
  if (screenType && screenType !== 'page') {
    const defaultWidth = SCREEN_TYPE_VIEWPORTS[screenType];
    if (defaultWidth > 0) {
      debugLog(`resolveViewports: screenType=${screenType} → [${defaultWidth}]`);
      return [defaultWidth];
    }
    // sheet uses -1 sentinel → falls through to page default chain
  }

  // 3. Per-page viewports from pages.yaml
  if (pageViewports && pageViewports.length > 0) {
    return pageViewports;
  }

  // 3-5. Design config from agentforge.yaml
  if (designConfig) {
    const { responsive_breakpoints, layout_strategy, primary_viewport } = designConfig;

    // 3. responsive_breakpoints: true → standard breakpoints
    if (responsive_breakpoints === true) {
      return layout_strategy === 'mobile-first'
        ? STANDARD_BREAKPOINTS_MOBILE_FIRST
        : STANDARD_BREAKPOINTS_DESKTOP_FIRST;
    }

    // 4. responsive_breakpoints: number[] → explicit list
    if (Array.isArray(responsive_breakpoints) && responsive_breakpoints.length > 0) {
      return responsive_breakpoints;
    }

    // 5. responsive_breakpoints: false/missing → primary_viewport only
    logDefaults('resolveViewports', {
      primary_viewport: [primary_viewport, String(DEFAULT_VIEWPORT)],
    });
    return [primary_viewport ?? DEFAULT_VIEWPORT];
  }

  // 6. Nothing set → default
  debugLog('resolveViewports: no config provided → default viewport [1440]');
  return [DEFAULT_VIEWPORT];
}
