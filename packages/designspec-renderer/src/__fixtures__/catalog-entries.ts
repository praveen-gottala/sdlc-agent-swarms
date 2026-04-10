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
  background: 'surface-input',
  min_height: 44,
  required_fields: ['label', 'placeholder'],
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
  required_fields: ['label', 'placeholder'],
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
  required_fields: ['label'],
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
  required_fields: ['label'],
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
  required_fields: ['label'],
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
  required_fields: ['options'],
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
  required_fields: ['label', 'value'],
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
  required_fields: ['label', 'value'],
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
  required_fields: [],
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
  required_fields: ['label'],
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
  required_fields: ['label', 'value'],
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
  required_fields: ['label'],
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
  required_fields: ['content'],
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
  required_fields: ['label'],
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
  required_fields: ['label', 'placeholder'],
  library: {
    shadcn: { component: 'Select', import: '@/components/ui/select' },
  },
};

/** Chip / pill tag. */
const CHIP: CatalogEntry = {
  type: 'chip',
  background: 'surface-secondary',
  text_color: 'text-primary',
  border_color: 'border-default',
  radius: 16,
  padding_x: 12,
  padding_y: 4,
  gap: 4,
  text_typography: 'label',
  min_height: 44,
  required_fields: ['label'],
  library: {
    shadcn: { component: 'Badge', import: '@/components/ui/badge', props: { variant: 'outline' } },
  },
};

/** Alert / notification banner. */
const ALERT: CatalogEntry = {
  type: 'alert',
  background: 'cta-primary',
  opacity: 0.1,
  text_color: 'text-primary',
  border_color: 'cta-primary',
  radius: 12,
  padding_x: 16,
  padding_y: 12,
  gap: 8,
  text_typography: 'label',
  min_height: 48,
  required_fields: ['label'],
  library: {
    shadcn: { component: 'Alert', import: '@/components/ui/alert' },
  },
};

/** Skeleton loading placeholder. */
const SKELETON: CatalogEntry = {
  type: 'skeleton',
  background: 'surface-secondary',
  opacity: 0.6,
  height: 20,
  radius: 4,
  required_fields: [],
  library: {
    shadcn: { component: 'Skeleton', import: '@/components/ui/skeleton' },
  },
};

/** Loading spinner. */
const LOADING_SPINNER: CatalogEntry = {
  type: 'loading-spinner',
  background: 'transparent',
  spinner_color: 'cta-primary',
  spinner_size: 24,
  text_color: 'text-secondary',
  gap: 8,
  required_fields: [],
  library: {
    shadcn: { component: 'div', note: 'Custom spinner composition' },
  },
};

/** Hyperlink text. */
const LINK: CatalogEntry = {
  type: 'link',
  background: 'transparent',
  text_color: 'cta-primary',
  text_typography: 'body',
  gap: 4,
  min_height: 44,
  required_fields: ['label'],
  library: {
    shadcn: { component: 'a', note: 'Native anchor or Link component' },
  },
};

/** Toggle switch. */
const SWITCH: CatalogEntry = {
  type: 'switch',
  background: 'surface-secondary',
  track_color: 'surface-secondary',
  thumb_color: 'surface-primary',
  track_width: 44,
  track_height: 24,
  thumb_size: 20,
  track_radius: 12,
  text_color: 'text-primary',
  text_typography: 'body',
  min_height: 44,
  required_fields: ['label'],
  library: {
    shadcn: { component: 'Switch', import: '@/components/ui/switch' },
  },
};

/** Data table. */
const DATA_TABLE: CatalogEntry = {
  type: 'data-table',
  background: 'surface-primary',
  text_color: 'text-primary',
  border_color: 'border-default',
  radius: 8,
  padding: 0,
  required_fields: [],
  library: {
    shadcn: { component: 'Table', import: '@/components/ui/table' },
  },
};

/** Standalone semantic icon. */
const ICON: CatalogEntry = {
  type: 'icon',
  background: 'transparent',
  required_fields: [],
  library: {
    shadcn: { component: 'Icon', note: 'Semantic icon resolved by browser renderer' },
  },
};

/** Content image placeholder. */
const IMAGE: CatalogEntry = {
  type: 'image',
  background: 'surface-secondary',
  radius: 8,
  required_fields: [],
  library: {
    shadcn: { component: 'div', note: 'Image placeholder composition' },
  },
};

/** Decorative illustration placeholder. */
const ILLUSTRATION: CatalogEntry = {
  type: 'illustration',
  background: 'surface-secondary',
  radius: 12,
  required_fields: [],
  library: {
    shadcn: { component: 'div', note: 'Illustration placeholder composition' },
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
  'chip': CHIP,
  'alert': ALERT,
  'skeleton': SKELETON,
  'loading-spinner': LOADING_SPINNER,
  'link': LINK,
  'switch': SWITCH,
  'data-table': DATA_TABLE,
  'icon': ICON,
  'image': IMAGE,
  'illustration': ILLUSTRATION,
};
