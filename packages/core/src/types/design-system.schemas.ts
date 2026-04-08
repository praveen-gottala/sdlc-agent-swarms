/**
 * @module @agentforge/core/types/design-system.schemas
 *
 * Zod schemas that mirror the TypeScript interfaces in design-system.ts.
 * These enable runtime validation of design system YAML spec files.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Color schemas
// ---------------------------------------------------------------------------

export const PrimitiveColorsSchema = z.record(z.string(), z.string());
export const SemanticColorsSchema = z.record(z.string(), z.string());
export const ColorSpecSchema = z.object({
  primitive: PrimitiveColorsSchema,
  semantic: SemanticColorsSchema,
});

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const TypographyScaleEntrySchema = z.object({
  role: z.string(),
  size: z.number(),
  weight: z.number(),
  family: z.string(),
  line_height: z.number().optional(),
  letter_spacing: z.number().optional(),
});

export const TypographySpecSchema = z.object({
  font_families: z.record(z.string(), z.string()),
  scale: z.array(TypographyScaleEntrySchema),
});

// ---------------------------------------------------------------------------
// Spacing
// ---------------------------------------------------------------------------

export const SpacingSpecSchema = z.object({
  unit: z.number(),
  scale: z.array(z.number()),
});

// ---------------------------------------------------------------------------
// Border
// ---------------------------------------------------------------------------

export const BorderSpecSchema = z.object({
  radius: z.record(z.string(), z.number()),
});

// ---------------------------------------------------------------------------
// Touch targets
// ---------------------------------------------------------------------------

export const TouchTargetSpecSchema = z.object({
  minimum_height: z.number(),
  minimum_width: z.number(),
});

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

export const ElevationLevelSchema = z.object({
  level: z.number(),
  shadow: z.string(),
  description: z.string(),
});

export const ElevationSpecSchema = z.object({
  levels: z.array(ElevationLevelSchema),
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const LayoutSpecSchema = z.object({
  grid: z.object({
    columns: z.number(),
    gutter: z.number(),
    margin: z.number(),
  }),
  content_max_width: z.number(),
  breakpoints: z.object({
    mobile: z.number(),
    tablet: z.number(),
    desktop: z.number(),
    wide: z.number(),
  }),
});

// ---------------------------------------------------------------------------
// Z-index
// ---------------------------------------------------------------------------

export const ZIndexSpecSchema = z.object({
  dropdown: z.number(),
  sticky: z.number(),
  modal: z.number(),
  toast: z.number(),
  tooltip: z.number(),
});

// ---------------------------------------------------------------------------
// Opacity
// ---------------------------------------------------------------------------

export const OpacitySpecSchema = z.object({
  scale: z.record(z.string(), z.number()),
});

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const MotionSpecSchema = z.object({
  durations: z.record(z.string(), z.number()),
  easings: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// Border width
// ---------------------------------------------------------------------------

export const BorderWidthSpecSchema = z.object({
  widths: z.record(z.string(), z.number()),
  styles: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// Text extras
// ---------------------------------------------------------------------------

export const TextExtrasSpecSchema = z.object({
  transforms: z.record(z.string(), z.string()),
  letter_spacing: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// State tokens
// ---------------------------------------------------------------------------

export const StateTokensSpecSchema = z.object({
  hover_opacity: z.number().optional(),
  focus_ring: z.object({
    color: z.string(),
    width: z.number(),
    offset: z.number(),
  }),
  disabled_opacity: z.number(),
  active_scale: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Complete design tokens spec
// ---------------------------------------------------------------------------

export const DesignTokensSpecSchema = z.object({
  version: z.string(),
  created_by: z.string(),
  colors: ColorSpecSchema,
  typography: TypographySpecSchema,
  spacing: SpacingSpecSchema,
  borders: BorderSpecSchema,
  touch_targets: TouchTargetSpecSchema,
  elevation: ElevationSpecSchema,
  layout: LayoutSpecSchema,
  z_index: ZIndexSpecSchema,
  opacity: OpacitySpecSchema,
  motion: MotionSpecSchema,
  state: StateTokensSpecSchema,
  border_styles: BorderWidthSpecSchema.optional(),
  text_extras: TextExtrasSpecSchema.optional(),
});

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export const BrandIdentitySchema = z.object({
  tone: z.string(),
  audience: z.string(),
  cultural_context: z.string().optional(),
});

export const IllustrationStyleSchema = z.object({
  direction: z.string(),
  description: z.string(),
});

export const MotionPrinciplesSchema = z.object({
  page_transitions: z.string(),
  interaction_feel: z.string(),
  easing: z.string(),
  duration_base_ms: z.number(),
});

export const AccessibilitySpecSchema = z.object({
  wcag_level: z.enum(['A', 'AA', 'AAA']),
  target_audience_age_min: z.number().optional(),
  touch_target_override: z.number().optional(),
});

export const BrandSpecSchema = z.object({
  version: z.string(),
  created_by: z.string(),
  identity: BrandIdentitySchema,
  illustration_style: IllustrationStyleSchema,
  motion_principles: MotionPrinciplesSchema,
  accessibility: AccessibilitySpecSchema,
});

// ---------------------------------------------------------------------------
// Component catalog schemas
// ---------------------------------------------------------------------------

export const ComponentAnatomySlotSchema = z.object({
  name: z.string(),
  contents: z.string(),
  typography_role: z.string().optional(),
  optional: z.boolean().optional(),
});

export const ComponentStateTokensSchema = z.object({
  bg: z.string(),
  text: z.string(),
  border: z.string().optional(),
  border_width: z.number().optional(),
  shadow: z.string().optional(),
  opacity: z.number().optional(),
});

export const ComponentTokenBindingsSchema = z.object({
  background: z.string().optional(),
  text: z.string().optional(),
  'border-radius': z.string().optional(),
  'padding-x': z.number().optional(),
  'padding-y': z.number().optional(),
  font: z.string().optional(),
});

export const ComponentSpacingSchema = z.object({
  padding: z.string(),
  internal_gap: z.string(),
});

export const ComponentAccessibilitySchema = z.object({
  focus_visible: z.boolean(),
  aria_labels: z.array(z.string()),
  keyboard_nav: z.string().optional(),
});

export const CatalogLibraryMappingSchema = z.object({
  component_name: z.string(),
  import_path: z.string(),
  slot_mapping: z.record(z.string(), z.string()).optional(),
  variant_prop: z.string().optional(),
  size_prop: z.string().optional(),
});

export const ComponentCatalogEntrySchema = z.object({
  description: z.string(),
  category: z.string(),
  min_height: z.number().optional(),
  anatomy: z.array(ComponentAnatomySlotSchema),
  variants: z.record(z.string(), ComponentStateTokensSchema.partial()).optional(),
  states: z.record(z.string(), ComponentStateTokensSchema),
  token_bindings: ComponentTokenBindingsSchema.optional(),
  spacing: ComponentSpacingSchema,
  library_mapping: z.record(z.string(), CatalogLibraryMappingSchema),
  accessibility: ComponentAccessibilitySchema,
});

export const ComponentCatalogSpecSchema = z.object({
  version: z.string(),
  created_by: z.string(),
  components: z.record(z.string(), ComponentCatalogEntrySchema),
});

// ---------------------------------------------------------------------------
// Component library
// ---------------------------------------------------------------------------

export const ReactComponentMappingSchema = z.object({
  import_path: z.string(),
  component_name: z.string(),
  variant_prop: z.string().optional(),
  size_prop: z.string().optional(),
});

export const ComponentLibrarySpecSchema = z.object({
  library_id: z.string(),
  library_name: z.string(),
  install_hint: z.string(),
  docs_url: z.string(),
  react_mappings: z.record(z.string(), ReactComponentMappingSchema),
});
