/**
 * @module @agentforge/core/config/viewport-resolver
 *
 * Resolves the viewport widths for design generation using a priority chain:
 * 1. CLI --width flag (highest)
 * 2. Per-page viewports from pages.yaml
 * 3. Design config from agentforge.yaml (responsive_breakpoints / primary_viewport)
 * 4. Default [1440] (fallback)
 *
 * Follows the same pattern as model-resolver.ts.
 */

import type { DesignConfig } from '../types/index.js';

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
 * 2. `pageViewports` set and non-empty → `pageViewports`
 * 3. `designConfig.responsive_breakpoints` is `true` → standard breakpoints based on `layout_strategy`
 * 4. `designConfig.responsive_breakpoints` is a non-empty array → that array
 * 5. `designConfig.responsive_breakpoints` is `false`/missing → `[designConfig.primary_viewport ?? 1440]`
 * 6. Nothing set → `[1440]`
 *
 * @returns Array of viewport widths in generation order
 */
export function resolveViewports(input: ResolveViewportsInput): readonly number[] {
  const { cliWidth, pageViewports, designConfig } = input;

  // 1. CLI --width flag (highest priority)
  if (cliWidth !== undefined && cliWidth > 0) {
    return [cliWidth];
  }

  // 2. Per-page viewports from pages.yaml
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
    return [primary_viewport ?? DEFAULT_VIEWPORT];
  }

  // 6. Nothing set → default
  return [DEFAULT_VIEWPORT];
}
