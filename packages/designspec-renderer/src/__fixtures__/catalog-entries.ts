/**
 * V2 built-in catalog entries — test fixture.
 * These are the default catalog entries defined in Section 6 of the requirements doc.
 */
import type { CatalogEntry, CatalogMap } from '../types/catalog.js';

/** Input text defaults. */
const INPUT_TEXT: CatalogEntry = {
  type: 'input',
  variant: 'text',
  height: 48,
  radius: 12,
  border_color: 'border-default',
  border_width: 1,
  text_typography: 'body',
  text_color: 'text-primary',
  background: 'surface-primary',
  min_height: 44,
  library: {
    shadcn: { component: 'Input', import: '@/components/ui/input' },
  },
};

/** Input currency — extends input-text. */
const INPUT_CURRENCY: CatalogEntry = {
  ...INPUT_TEXT,
  extends: 'input-text',
  variant: 'currency',
  prefix: '$',
};

/** Primary CTA button. */
const BUTTON_PRIMARY: CatalogEntry = {
  type: 'button',
  variant: 'primary',
  height: 48,
  radius: 12,
  background: 'cta-primary',
  text_color: 'text-on-cta',
  text_typography: 'body',
  text_weight: 600,
  width: 'fill',
  shadow: 'none',
  library: {
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'default' } },
  },
};

/** Secondary outlined button. */
const BUTTON_SECONDARY: CatalogEntry = {
  type: 'button',
  variant: 'secondary',
  height: 44,
  radius: 12,
  background: 'surface-primary',
  text_color: 'text-primary',
  text_typography: 'body',
  text_weight: 500,
  border_color: 'border-default',
  border_width: 1,
  shadow: 'none',
  library: {
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'outline' } },
  },
};

/** Ghost text-only button. */
const BUTTON_GHOST: CatalogEntry = {
  type: 'button',
  variant: 'ghost',
  height: 44,
  radius: 0,
  background: 'transparent',
  text_color: 'cta-primary',
  text_typography: 'body',
  text_weight: 500,
  shadow: 'none',
  library: {
    shadcn: { component: 'Button', import: '@/components/ui/button', props: { variant: 'ghost' } },
  },
};

/** Segmented control (pill selector). */
const SEGMENTED_CONTROL: CatalogEntry = {
  type: 'segmented-control',
  height: 48,
  radius: 24,
  inner_radius: 20,
  padding: 4,
  container_background: 'surface-elevated',
  container_border_color: 'border-default',
  container_border_opacity: 0.5,
  selected_bg: 'cta-primary',
  selected_text: 'text-on-cta',
  selected_weight: 600,
  unselected_bg: 'transparent',
  unselected_text: 'text-primary',
  unselected_weight: 400,
  text_size: 14,
  library: {
    shadcn: { component: 'Tabs', import: '@/components/ui/tabs' },
  },
};

/** Stepper (increment/decrement). */
const STEPPER: CatalogEntry = {
  type: 'stepper',
  height: 56,
  radius: 12,
  background: 'surface-elevated',
  shadow: 'sm',
  button_size: 40,
  minus_bg: 'surface-secondary',
  minus_border: 'border-default',
  minus_border_opacity: 0.5,
  minus_text_color: 'text-secondary',
  plus_bg: 'cta-primary',
  plus_text_color: 'text-on-cta',
  count_typography: 'heading-2',
  count_color: 'text-primary',
  library: {
    shadcn: { component: 'div', note: 'Custom composition' },
  },
};

/** Display readonly (label + value). */
const DISPLAY_READONLY: CatalogEntry = {
  type: 'display',
  text_typography: 'heading-3',
  text_color: 'text-secondary',
  background: 'surface-elevated',
  height: 48,
  radius: 8,
  padding_x: 16,
  library: {
    shadcn: { component: 'div', note: 'Display-only' },
  },
};

/** Card container. */
const CARD: CatalogEntry = {
  type: 'card',
  background: 'surface-primary',
  shadow: 'sm',
  radius: 20,
  padding: 24,
  library: {
    shadcn: { component: 'Card', import: '@/components/ui/card' },
  },
};

/** Badge / status pill. */
const BADGE: CatalogEntry = {
  type: 'badge',
  height: 24,
  radius: 8,
  padding_x: 8,
  padding_y: 2,
  text_size: 11,
  text_weight: 500,
  library: {
    shadcn: { component: 'Badge', import: '@/components/ui/badge' },
  },
};

/** Stat metric card. */
const STAT: CatalogEntry = {
  type: 'stat',
  background: 'surface-primary',
  shadow: 'sm',
  radius: 20,
  padding_x: 24,
  padding_y: 20,
  library: {
    shadcn: { component: 'Card', import: '@/components/ui/card', note: 'Stat is a styled Card' },
  },
};

/** Avatar circle. */
const AVATAR: CatalogEntry = {
  type: 'avatar',
  size: 36,
  text_color: 'cta-primary',
  bg_opacity: 0.12,
  text_size: 14,
  text_weight: 700,
  library: {
    shadcn: { component: 'Avatar', import: '@/components/ui/avatar' },
  },
};

/** Tooltip inline. */
const TOOLTIP: CatalogEntry = {
  type: 'tooltip',
  height: 40,
  radius: 8,
  shadow: 'sm',
  padding_x: 16,
  icon_size: 16,
  text_size: 11,
  text_color: 'text-primary',
  library: {
    shadcn: { component: 'Alert', import: '@/components/ui/alert' },
  },
};

/** Checkbox. */
const CHECKBOX: CatalogEntry = {
  type: 'checkbox',
  box_size: 16,
  box_radius: 4,
  box_border: 'border-default',
  box_checked_bg: 'cta-primary',
  check_color: 'text-on-cta',
  min_height: 44,
  library: {
    shadcn: { component: 'Checkbox', import: '@/components/ui/checkbox' },
  },
};

/** Select dropdown. */
const SELECT: CatalogEntry = {
  ...INPUT_TEXT,
  extends: 'input-text',
  variant: 'select',
  chevron_color: 'text-secondary',
  chevron_size: 12,
  library: {
    shadcn: { component: 'Select', import: '@/components/ui/select' },
  },
};

/** All V2 built-in catalog entries. */
export const V2_BUILTIN_CATALOG: CatalogMap = {
  'input-text': INPUT_TEXT,
  'input-currency': INPUT_CURRENCY,
  'button-primary': BUTTON_PRIMARY,
  'button-secondary': BUTTON_SECONDARY,
  'button-ghost': BUTTON_GHOST,
  'segmented-control': SEGMENTED_CONTROL,
  'stepper': STEPPER,
  'display-readonly': DISPLAY_READONLY,
  'card': CARD,
  'badge': BADGE,
  'stat': STAT,
  'avatar': AVATAR,
  'tooltip': TOOLTIP,
  'checkbox': CHECKBOX,
  'select': SELECT,
};
