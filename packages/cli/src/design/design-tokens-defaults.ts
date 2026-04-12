/**
 * @module @agentforge/cli/design/design-tokens-defaults
 *
 * Default design token constants used as fallbacks when the LLM doesn't
 * provide specific values. Shared across init, design-generate, and
 * generate-design-options commands.
 */

import type { OpacitySpec, MotionSpec, StateTokensSpec, ElevationSpec, TypographyScaleEntry } from '@agentforge/core';

/** Default layout tokens — used as fallback when LLM doesn't override. */
export const DEFAULT_LAYOUT_TOKENS = {
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] as readonly number[] },
  borders: { radius: { small: 8, medium: 12, large: 16, pill: 9999 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
  layout: {
    grid: { columns: 12, gutter: 24, margin: 24 },
    content_max_width: 1280,
    breakpoints: { mobile: 640, tablet: 768, desktop: 1024, wide: 1440 },
  },
  z_index: { dropdown: 1000, sticky: 1100, modal: 1200, toast: 1300, tooltip: 1400 },
} as const;

/** @deprecated Use DEFAULT_LAYOUT_TOKENS instead. */
export const SHARED_LAYOUT = DEFAULT_LAYOUT_TOKENS;

/** Default opacity tokens — used as fallback when LLM doesn't override. */
export const DEFAULT_OPACITY: OpacitySpec = {
  scale: { subtle: 0.1, muted: 0.3, disabled: 0.38, overlay: 0.5 },
};

/** Default motion tokens — used as fallback when LLM doesn't override. */
export const DEFAULT_MOTION: MotionSpec = {
  durations: { fast: 100, normal: 200, slow: 400, page: 600 },
  easings: { default: 'ease-out', emphasized: 'cubic-bezier(0.2,0,0,1)' },
};

/** Default state tokens — used as fallback when LLM doesn't override. */
export const DEFAULT_STATE: StateTokensSpec = {
  hover_opacity: 0.08,
  disabled_opacity: 0.38,
  focus_ring: { color: 'cta-primary', width: 2, offset: 2 },
};

/** Default elevation used when LLM omits elevation. */
export const DEFAULT_ELEVATION: ElevationSpec = {
  levels: [
    { level: 0, shadow: 'none', description: 'Flat, no elevation' },
    { level: 1, shadow: '0 1px 3px rgba(0,0,0,0.08)', description: 'Cards resting on surface' },
    { level: 2, shadow: '0 4px 12px rgba(0,0,0,0.12)', description: 'Dropdowns, popovers' },
    { level: 3, shadow: '0 8px 24px rgba(0,0,0,0.16)', description: 'Modals, dialogs' },
  ],
};

/** Default typography scale — used as fallback when LLM doesn't override. */
export const DEFAULT_TYPOGRAPHY_SCALE: readonly TypographyScaleEntry[] = [
  { role: 'heading-1', size: 32, weight: 700, family: 'display', line_height: 1.2 },
  { role: 'heading-2', size: 24, weight: 700, family: 'display', line_height: 1.25 },
  { role: 'heading-3', size: 18, weight: 600, family: 'display', line_height: 1.3 },
  { role: 'body', size: 14, weight: 400, family: 'body', line_height: 1.5 },
  { role: 'label', size: 12, weight: 500, family: 'body', line_height: 1.4 },
  { role: 'small', size: 11, weight: 400, family: 'body', line_height: 1.4 },
];

/** Preview data for domain-appropriate dashboard content. */
export interface PreviewData {
  readonly metrics: readonly { label: string; value: string; trend?: string }[];
  readonly table_rows?: readonly { name: string; status: string; amount: string; date: string }[];
  readonly nav_items?: readonly string[];
}

/** Default preview data used when LLM doesn't provide domain-specific content. */
export const DEFAULT_PREVIEW: PreviewData = {
  metrics: [
    { label: 'Total Users', value: '12,847', trend: '+12.5%' },
    { label: 'Revenue', value: '$48.2K', trend: '+8.1%' },
    { label: 'Active Now', value: '342', trend: '-2.3%' },
  ],
  table_rows: [
    { name: 'Sarah Johnson', status: 'Active', amount: '$2,450', date: 'Mar 15' },
    { name: 'Alex Chen', status: 'Pending', amount: '$1,870', date: 'Mar 14' },
    { name: 'Maria Garcia', status: 'Active', amount: '$3,200', date: 'Mar 13' },
    { name: 'James Wilson', status: 'Inactive', amount: '$950', date: 'Mar 12' },
  ],
  nav_items: ['Dashboard', 'Analytics', 'Settings', 'Users'],
};
