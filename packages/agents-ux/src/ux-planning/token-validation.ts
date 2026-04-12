/**
 * @module @agentforge/agents-ux/ux-planning/token-validation
 *
 * Token name extraction, validation, and correction utilities.
 * Used by the UX planning agent to ensure LLM-generated token bindings
 * reference only valid design token names from the project's design system.
 */

import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';

// ============================================================================
// Token name helpers
// ============================================================================

/**
 * Extract the set of valid token names from a DesignTokensSpec.
 * Includes semantic color names, typography role names, spacing scale values,
 * border radius names, elevation levels, layout tokens, breakpoints,
 * touch targets, z-index names, and brand motion tokens.
 */
export const extractValidTokenNames = (spec: DesignTokensSpec, brand?: BrandSpec): Set<string> => {
  const names = new Set<string>();

  // Semantic color names (e.g., "background-primary", "surface-primary", "text-primary")
  for (const name of Object.keys(spec.colors.semantic)) {
    names.add(name);
  }

  // Typography role names (e.g., "heading-1", "body", "label")
  for (const entry of spec.typography.scale) {
    names.add(entry.role);
  }

  // Spacing scale values as strings (e.g., "4", "8", "24", "32")
  // Zero spacing is a valid design choice (e.g., no gap, no padding)
  names.add('0');
  for (const value of spec.spacing.scale) {
    names.add(String(value));
  }

  // Border radius names (e.g., "small", "medium", "large", "pill")
  for (const name of Object.keys(spec.borders.radius)) {
    names.add(name);
  }

  // Elevation levels (e.g., "elevation-0", "elevation-1")
  if (spec.elevation?.levels) {
    for (const entry of spec.elevation.levels) {
      names.add(`elevation-${entry.level}`);
    }
  }

  // Layout tokens
  if (spec.layout) {
    names.add('content-max-width');
    if (spec.layout.grid) {
      names.add('grid-columns');
      names.add('grid-gutter');
      names.add('grid-margin');
    }
    // Breakpoint names (e.g., "breakpoint-mobile", "breakpoint-tablet")
    if (spec.layout.breakpoints) {
      for (const name of Object.keys(spec.layout.breakpoints)) {
        names.add(`breakpoint-${name}`);
      }
    }
  }

  // Touch targets
  if (spec.touch_targets) {
    names.add('touch-min-height');
    names.add('touch-min-width');
  }

  // Z-index names (e.g., "z-dropdown", "z-modal")
  if (spec.z_index) {
    for (const name of Object.keys(spec.z_index)) {
      names.add(`z-${name}`);
    }
  }

  // Brand motion tokens
  if (brand?.motion_principles) {
    names.add('duration-base');
    names.add('easing-default');
  }

  // Opacity tokens (e.g., "opacity-subtle", "opacity-muted", "opacity-disabled")
  if (spec.opacity?.scale) {
    for (const name of Object.keys(spec.opacity.scale)) {
      names.add(`opacity-${name}`);
    }
  }

  // Motion tokens (e.g., "duration-fast", "duration-normal", "easing-emphasized")
  if (spec.motion) {
    for (const name of Object.keys(spec.motion.durations)) {
      names.add(`duration-${name}`);
    }
    for (const name of Object.keys(spec.motion.easings)) {
      names.add(`easing-${name}`);
    }
  }

  // State tokens (e.g., "hover-opacity", "disabled-opacity", "focus-ring-color")
  if (spec.state) {
    names.add('hover-opacity');
    names.add('disabled-opacity');
    names.add('focus-ring-color');
    names.add('focus-ring-width');
    if (spec.state.active_scale != null) names.add('active-scale');
  }

  // Border style tokens (e.g., "border-thin", "border-medium")
  if (spec.border_styles) {
    for (const name of Object.keys(spec.border_styles.widths)) {
      names.add(`border-${name}`);
    }
  }

  // Text extras (e.g., "tracking-tight", "text-uppercase")
  if (spec.text_extras) {
    for (const name of Object.keys(spec.text_extras.letter_spacing)) {
      names.add(`tracking-${name}`);
    }
    for (const name of Object.keys(spec.text_extras.transforms)) {
      names.add(`text-${name}`);
    }
  }

  return names;
};

/**
 * Build a token name allowlist section for the user message.
 * This explicitly tells the LLM which token names are valid.
 */
export const buildTokenAllowlist = (spec: DesignTokensSpec, brand?: BrandSpec): string => {
  const semanticColors = Object.keys(spec.colors.semantic).join(', ');
  const typographyRoles = spec.typography.scale.map(e => e.role).join(', ');
  const spacingValues = spec.spacing.scale.join(', ');
  const radiusNames = Object.keys(spec.borders.radius).join(', ');

  const sections = [
    `- Semantic colors: ${semanticColors}`,
    `- Typography roles: ${typographyRoles}`,
    `- Spacing values (px): ${spacingValues}`,
    `- Border radius: ${radiusNames}`,
  ];

  if (spec.elevation?.levels) {
    const elevationNames = spec.elevation.levels.map(e => `elevation-${e.level}`).join(', ');
    sections.push(`- Elevation: ${elevationNames} (not raw box-shadow values like "0 2px 8px rgba(...)")`);
  }

  if (spec.layout) {
    const layoutNames = ['content-max-width'];
    if (spec.layout.grid) {
      layoutNames.push('grid-columns', 'grid-gutter', 'grid-margin');
    }
    if (spec.layout.breakpoints) {
      for (const name of Object.keys(spec.layout.breakpoints)) {
        layoutNames.push(`breakpoint-${name}`);
      }
    }
    sections.push(`- Layout: ${layoutNames.join(', ')} (not raw numbers like "1280")`);
  }

  if (spec.touch_targets) {
    sections.push(`- Touch targets: touch-min-height, touch-min-width (not raw numbers like "44")`);
  }

  if (spec.z_index) {
    const zNames = Object.keys(spec.z_index).map(n => `z-${n}`).join(', ');
    sections.push(`- Z-index: ${zNames} (not raw numbers like "1000")`);
  }

  if (brand?.motion_principles) {
    sections.push(`- Animation: duration-base, easing-default (not raw values like "200")`);
  }

  // Opacity tokens
  if (spec.opacity?.scale) {
    const opacityNames = Object.keys(spec.opacity.scale).map(n => `opacity-${n}`).join(', ');
    sections.push(`- Opacity: ${opacityNames}`);
  }

  // Motion tokens
  if (spec.motion) {
    const durationNames = Object.keys(spec.motion.durations).map(n => `duration-${n}`).join(', ');
    const easingNames = Object.keys(spec.motion.easings).map(n => `easing-${n}`).join(', ');
    sections.push(`- Motion durations: ${durationNames}`);
    sections.push(`- Motion easings: ${easingNames}`);
  }

  // State tokens
  if (spec.state) {
    const stateNames = ['hover-opacity', 'disabled-opacity', 'focus-ring-color', 'focus-ring-width'];
    if (spec.state.active_scale != null) stateNames.push('active-scale');
    sections.push(`- State: ${stateNames.join(', ')}`);
  }

  // Border style tokens
  if (spec.border_styles) {
    const widthNames = Object.keys(spec.border_styles.widths).map(n => `border-${n}`).join(', ');
    sections.push(`- Border widths: ${widthNames}`);
  }

  // Text extras
  if (spec.text_extras) {
    const trackingNames = Object.keys(spec.text_extras.letter_spacing).map(n => `tracking-${n}`).join(', ');
    const transformNames = Object.keys(spec.text_extras.transforms).map(n => `text-${n}`).join(', ');
    sections.push(`- Letter spacing: ${trackingNames}`);
    sections.push(`- Text transforms: ${transformNames}`);
  }

  return `\n\nVALID TOKEN NAMES (use ONLY these in tokenBindings — any other name will fail downstream):
${sections.join('\n')}

IMPORTANT: Do NOT invent names like "color.surface.primary", "color.border.input", "spacing.lg", or "color.text.inverse". Use the exact names listed above.`;
};

/** Common dot-notation → semantic name mappings for warning messages. */
const DOT_NOTATION_HINTS: Record<string, string> = {
  'color.background.primary': 'background-primary',
  'color.surface.primary': 'surface-primary',
  'color.surface.secondary': 'surface-secondary',
  'color.surface.tertiary': 'surface-elevated',
  'color.surface.elevated': 'surface-elevated',
  'color.surface.accent': 'surface-elevated',
  'color.surface.disabled': 'surface-secondary',
  'color.text.primary': 'text-primary',
  'color.text.secondary': 'text-secondary',
  'color.text.inverse': 'text-on-cta',
  'text-on-primary': 'text-on-cta',
  'color.text.accent': 'cta-primary',
  'color.text.disabled': 'text-disabled',
  'color.border.default': 'border-default',
  'color.border.input': 'border-default',
  'color.border.subtle': 'border-default',
  'color.border.focus': 'border-focus',
  'color.border.error': 'border-error',
  'color.primary': 'cta-primary',
  'color.error': 'error',
  'color.success': 'success',
  'color.warning': 'warning',
  'spacing.xs': '4',
  'spacing.sm': '8',
  'spacing.md': '16',
  'spacing.lg': '24',
  'spacing.xl': '32',
  'spacing.2xl': '48',
  // Elevation
  'elevation.0': 'elevation-0',
  'elevation.1': 'elevation-1',
  'elevation.2': 'elevation-2',
  'elevation.3': 'elevation-3',
  'shadow.0': 'elevation-0',
  'shadow.1': 'elevation-1',
  'shadow.2': 'elevation-2',
  'shadow.3': 'elevation-3',
  // Layout
  'layout.maxWidth': 'content-max-width',
  'layout.contentMaxWidth': 'content-max-width',
  'layout.max_width': 'content-max-width',
  'layout.gridColumns': 'grid-columns',
  'layout.gridGutter': 'grid-gutter',
  'layout.gridMargin': 'grid-margin',
  // Touch targets
  'touch.minHeight': 'touch-min-height',
  'touch.minWidth': 'touch-min-width',
  'touch.minimum_height': 'touch-min-height',
  'touch.minimum_width': 'touch-min-width',
  'touchTarget.minHeight': 'touch-min-height',
  'touchTarget.minWidth': 'touch-min-width',
  // Z-index
  'zIndex.dropdown': 'z-dropdown',
  'zIndex.sticky': 'z-sticky',
  'zIndex.modal': 'z-modal',
  'zIndex.toast': 'z-toast',
  'zIndex.tooltip': 'z-tooltip',
  'z_index.dropdown': 'z-dropdown',
  'z_index.sticky': 'z-sticky',
  'z_index.modal': 'z-modal',
  'z_index.toast': 'z-toast',
  'z_index.tooltip': 'z-tooltip',
  // Motion
  'motion.duration': 'duration-base',
  'motion.durationBase': 'duration-base',
  'motion.easing': 'easing-default',
  'animation.duration': 'duration-base',
  'animation.easing': 'easing-default',
  'motion.fast': 'duration-fast',
  'motion.normal': 'duration-normal',
  'motion.slow': 'duration-slow',
  'motion.emphasized': 'easing-emphasized',
  // Opacity
  'opacity.subtle': 'opacity-subtle',
  'opacity.muted': 'opacity-muted',
  'opacity.disabled': 'opacity-disabled',
  'opacity.overlay': 'opacity-overlay',
  // State
  'state.hover': 'hover-opacity',
  'state.disabled': 'disabled-opacity',
  'state.focusRing': 'focus-ring-color',
  'state.hoverOpacity': 'hover-opacity',
  'state.disabledOpacity': 'disabled-opacity',
  'state.activeScale': 'active-scale',
  // Border widths
  'border.thin': 'border-thin',
  'border.medium': 'border-medium',
  'border.thick': 'border-thick',
  'borderWidth.thin': 'border-thin',
  'borderWidth.medium': 'border-medium',
  // Text extras
  'text.transform.uppercase': 'text-uppercase',
  'text.transform.capitalize': 'text-capitalize',
  'letterSpacing.tight': 'tracking-tight',
  'letterSpacing.normal': 'tracking-normal',
  'letterSpacing.wide': 'tracking-wide',
};

/**
 * Regex patterns for non-token binding keys.
 * Shared between filterNonTokenBindings() and applyDotNotationFallback() safety net.
 * Defined at module level to prevent drift.
 */

// These key suffixes are NEVER design tokens regardless of value
const ALWAYS_NON_TOKEN_KEYS = /\.(columns|rows|itemCount|maxItems|ariaLive|ariaLabel|role)$/;

// These key suffixes are non-tokens ONLY when the value is not a recognized token name
const DIMENSION_KEYS = /\.(width|height|maxWidth|minWidth|maxHeight|minHeight|cardWidth|imageHeight|thumbnailSize|columnWidth|buttonSize|searchMaxWidth)$/;

/**
 * Remove entries from tokenBindings that are fundamentally not design tokens.
 * These are component-specific dimensions, counts, and accessibility attributes
 * that the LLM incorrectly places in tokenBindings instead of defaultValues.
 *
 * Filter logic uses BOTH key suffix AND value to avoid false positives:
 * - Keys like .ariaLive, .columns are ALWAYS non-tokens (regardless of value)
 * - Keys like .width, .height are non-tokens ONLY when the value is not a valid token name
 *   (e.g., "280" is not a token, but "touch-min-height" could be)
 */
export function filterNonTokenBindings(
  bindings: Record<string, string>,
  validNames: Set<string>,
): { cleaned: Record<string, string>; removed: string[] } {
  const cleaned: Record<string, string> = {};
  const removed: string[] = [];

  for (const [key, value] of Object.entries(bindings)) {
    if (ALWAYS_NON_TOKEN_KEYS.test(key)) {
      removed.push(key);
    } else if (DIMENSION_KEYS.test(key) && !validNames.has(value)) {
      removed.push(key);
    } else {
      cleaned[key] = value;
    }
  }

  return { cleaned, removed };
}

/**
 * Validate tokenBindings values against known token names.
 * Returns a list of warning messages for any unrecognized values.
 */
export const validateTokenBindings = (
  bindings: Readonly<Record<string, string>>,
  validNames: Set<string>,
): string[] => {
  const warnings: string[] = [];

  for (const [key, value] of Object.entries(bindings)) {
    if (validNames.has(value)) continue;

    const hint = DOT_NOTATION_HINTS[value];
    if (hint) {
      warnings.push(`  "${key}": "${value}" → should be "${hint}" (dot-notation is not a valid token name)`);
    } else {
      warnings.push(`  "${key}": "${value}" is not a recognized token name`);
    }
  }

  return warnings;
};

/** Maximum number of token binding correction retries. */
export const MAX_TOKEN_BINDING_RETRIES = 2;

/**
 * Parse a tokenBindings-only correction response from the LLM.
 * Accepts both bare JSON and code-fenced JSON.
 */
export const parseTokenBindingsCorrection = (output: string): Record<string, string> | null => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const bindings = parsed.tokenBindings as Record<string, string> | undefined;
    if (bindings && typeof bindings === 'object') {
      return bindings;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Build a focused correction prompt for the LLM to fix only tokenBindings.
 * Includes the validation errors and the complete valid name list.
 */
export const buildTokenCorrectionPrompt = (
  originalOutput: string,
  warnings: string[],
  validNames: Set<string>,
): string => {
  const validNamesList = Array.from(validNames).join(', ');
  return `Your previous output contained invalid token binding names. Here are the problems:

IMPORTANT: If a property is a component-specific dimension (width, height, maxWidth, cardWidth, imageHeight, buttonSize, thumbnailSize, etc.), a count (columns, rows), or an accessibility attribute (ariaLive, ariaLabel), REMOVE it from tokenBindings entirely. These are NOT design tokens — they belong in the component's defaultValues, not in tokenBindings. Do not try to find a matching token name for these properties; just remove them.

${warnings.join('\n')}

The ONLY valid token names are: ${validNamesList}

Please output a corrected JSON object with ONLY the "tokenBindings" field. Use exact names from the valid list above. Do NOT use dot-notation (like "color.surface.primary") or invent names.

Your previous full output was:
${originalOutput}

Respond with ONLY a JSON object like:
\`\`\`json
{
  "tokenBindings": {
    "Component.property": "valid-token-name"
  }
}
\`\`\``;
};

/**
 * Apply deterministic DOT_NOTATION_HINTS corrections as a last-resort fallback.
 * Returns a corrected copy of the bindings and lists of corrections made / remaining issues.
 */
export const applyDotNotationFallback = (
  bindings: Readonly<Record<string, string>>,
  validNames: Set<string>,
): { corrected: Record<string, string>; corrections: string[]; remaining: string[] } => {
  const corrected: Record<string, string> = { ...bindings };
  const corrections: string[] = [];
  const remaining: string[] = [];

  for (const [key, value] of Object.entries(corrected)) {
    if (validNames.has(value)) continue;

    const hint = DOT_NOTATION_HINTS[value];
    if (hint && validNames.has(hint)) {
      corrected[key] = hint;
      corrections.push(`  "${key}": "${value}" → "${hint}"`);
    } else {
      remaining.push(`  "${key}": "${value}" has no known mapping`);
    }
  }

  // Final cleanup: strip any remaining non-token bindings that slipped through
  for (const key of Object.keys(corrected)) {
    if (ALWAYS_NON_TOKEN_KEYS.test(key)) {
      delete corrected[key];
    } else if (DIMENSION_KEYS.test(key) && !validNames.has(corrected[key])) {
      delete corrected[key];
    }
  }

  return { corrected, corrections, remaining };
};
