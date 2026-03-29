/**
 * @module @agentforge/core/types/design-system
 *
 * Typed interfaces for design system YAML spec files.
 * These define the project's visual identity and are consumed
 * by all design-phase agents and the visual verification layer.
 */

/** Primitive color definition (name → hex). */
export interface PrimitiveColors {
  readonly [name: string]: string;
}

/** Semantic color mapping (role → primitive color name). */
export interface SemanticColors {
  readonly [role: string]: string;
}

/** Color definitions combining primitive and semantic layers. */
export interface ColorSpec {
  readonly primitive: PrimitiveColors;
  readonly semantic: SemanticColors;
}

/** A single entry in the typography scale. */
export interface TypographyScaleEntry {
  readonly role: string;
  readonly size: number;
  readonly weight: number;
  readonly family: string;
  readonly line_height?: number;
  readonly letter_spacing?: number;
}

/** Typography spec with font families and scale. */
export interface TypographySpec {
  readonly font_families: Readonly<Record<string, string>>;
  readonly scale: readonly TypographyScaleEntry[];
}

/** Spacing spec with base unit and scale. */
export interface SpacingSpec {
  readonly unit: number;
  readonly scale: readonly number[];
}

/** Border radius tokens. */
export interface BorderSpec {
  readonly radius: Readonly<Record<string, number>>;
}

/** Touch target accessibility constraints. */
export interface TouchTargetSpec {
  readonly minimum_height: number;
  readonly minimum_width: number;
}

/** A single elevation level with shadow value and usage description. */
export interface ElevationLevel {
  readonly level: number;
  readonly shadow: string;        // CSS box-shadow value
  readonly description: string;   // e.g., "Cards resting on surface"
}

/** Elevation system defining shadow depth levels. */
export interface ElevationSpec {
  readonly levels: readonly ElevationLevel[];
}

/** Layout grid and breakpoint configuration. */
export interface LayoutSpec {
  readonly grid: {
    readonly columns: number;
    readonly gutter: number;
    readonly margin: number;
  };
  readonly content_max_width: number;
  readonly breakpoints: {
    readonly mobile: number;
    readonly tablet: number;
    readonly desktop: number;
    readonly wide: number;
  };
}

/** Z-index scale for layered UI elements. */
export interface ZIndexSpec {
  readonly dropdown: number;
  readonly sticky: number;
  readonly modal: number;
  readonly toast: number;
  readonly tooltip: number;
}

/** Opacity scale — enables glassmorphism, state layers, overlays. */
export interface OpacitySpec {
  readonly scale: Readonly<Record<string, number>>;
}

/** Motion tokens — enables distinctive animation character. */
export interface MotionSpec {
  readonly durations: Readonly<Record<string, number>>;
  readonly easings: Readonly<Record<string, string>>;
}

/** Border width + style tokens — beyond just radius. */
export interface BorderWidthSpec {
  readonly widths: Readonly<Record<string, number>>;
  readonly styles: Readonly<Record<string, string>>;
}

/** Text extras — enables premium typography. */
export interface TextExtrasSpec {
  readonly transforms: Readonly<Record<string, string>>;
  readonly letter_spacing: Readonly<Record<string, string>>;
}

/** State tokens — enables distinctive hover/focus/active interactions. */
export interface StateTokensSpec {
  readonly hover_opacity?: number;
  readonly focus_ring: { readonly color: string; readonly width: number; readonly offset: number };
  readonly disabled_opacity: number;
  readonly active_scale?: number;
}

/**
 * Complete design tokens spec file.
 * Stored at: agentforge/spec/design-tokens.yaml
 */
export interface DesignTokensSpec {
  readonly version: string;
  readonly created_by: string;
  readonly colors: ColorSpec;
  readonly typography: TypographySpec;
  readonly spacing: SpacingSpec;
  readonly borders: BorderSpec;
  readonly touch_targets: TouchTargetSpec;
  readonly elevation: ElevationSpec;
  readonly layout: LayoutSpec;
  readonly z_index: ZIndexSpec;
  readonly opacity: OpacitySpec;
  readonly motion: MotionSpec;
  readonly state: StateTokensSpec;
  readonly border_styles?: BorderWidthSpec;
  readonly text_extras?: TextExtrasSpec;
}

/** Brand identity direction. */
export interface BrandIdentity {
  readonly tone: string;
  readonly audience: string;
  readonly cultural_context?: string;
}

/** Illustration style direction. */
export interface IllustrationStyle {
  readonly direction: string;
  readonly description: string;
}

/** Motion/animation principles. */
export interface MotionPrinciples {
  readonly page_transitions: string;
  readonly interaction_feel: string;
  readonly easing: string;
  readonly duration_base_ms: number;
}

/** Accessibility configuration. */
export interface AccessibilitySpec {
  readonly wcag_level: 'A' | 'AA' | 'AAA';
  readonly target_audience_age_min?: number;
  readonly touch_target_override?: number;
}

/**
 * Brand direction spec file.
 * Stored at: agentforge/spec/brand.yaml
 */
export interface BrandSpec {
  readonly version: string;
  readonly created_by: string;
  readonly identity: BrandIdentity;
  readonly illustration_style: IllustrationStyle;
  readonly motion_principles: MotionPrinciples;
  readonly accessibility: AccessibilitySpec;
}

/** React component import mapping for a component library preset. */
export interface ReactComponentMapping {
  readonly import_path: string;
  readonly component_name: string;
  readonly variant_prop?: string;
  readonly size_prop?: string;
}

/**
 * Persisted component library metadata.
 * Stored at: agentforge/spec/component-library.yaml
 */
export interface ComponentLibrarySpec {
  readonly library_id: string;
  readonly library_name: string;
  readonly install_hint: string;
  readonly docs_url: string;
  readonly react_mappings: Record<string, ReactComponentMapping>;
}

// ============================================================================
// Component Catalog — shared anatomy definitions (design ↔ implementation)
// ============================================================================

/** A single slot in a component's anatomy (e.g., "header", "body", "footer"). */
export interface ComponentAnatomySlot {
  readonly name: string;
  readonly contents: string;
  readonly typography_role?: string;
  readonly optional?: boolean;
}

/** Token bindings for a component state (default, hover, disabled, etc.). */
export interface ComponentStateTokens {
  readonly bg: string;
  readonly text: string;
  readonly border?: string;
  readonly border_width?: number;
  readonly shadow?: string;
  readonly opacity?: number;
}

/** Flat semantic token bindings for a component's default rendering properties. */
export interface ComponentTokenBindings {
  readonly background?: string;
  readonly text?: string;
  readonly 'border-radius'?: string;
  readonly 'padding-x'?: number;
  readonly 'padding-y'?: number;
  readonly font?: string;
}

/** Spacing configuration for a component. */
export interface ComponentSpacing {
  readonly padding: string;
  readonly internal_gap: string;
}

/** Accessibility requirements for a component. */
export interface ComponentAccessibility {
  readonly focus_visible: boolean;
  readonly aria_labels: readonly string[];
  readonly keyboard_nav?: string;
}

/** Library-specific mapping for a component (e.g., shadcn, MUI, Chakra). */
export interface CatalogLibraryMapping {
  readonly component_name: string;
  readonly import_path: string;
  readonly slot_mapping?: Readonly<Record<string, string>>;
  readonly variant_prop?: string;
  readonly size_prop?: string;
}

/** A single component entry in the catalog. */
export interface ComponentCatalogEntry {
  readonly description: string;
  readonly category: string;
  readonly min_height?: number;
  readonly anatomy: readonly ComponentAnatomySlot[];
  readonly variants?: Readonly<Record<string, Partial<ComponentStateTokens>>>;
  readonly states: Readonly<Record<string, ComponentStateTokens>>;
  readonly token_bindings?: ComponentTokenBindings;
  readonly spacing: ComponentSpacing;
  readonly library_mapping: Readonly<Record<string, CatalogLibraryMapping>>;
  readonly accessibility: ComponentAccessibility;
}

/**
 * Component catalog spec file.
 * Stored at: agentforge/spec/component-catalog.yaml
 *
 * Provides the shared "single source of truth" for component anatomy,
 * states, token bindings, library mappings, and accessibility requirements.
 * Both design agents and implementation agents reference this catalog.
 */
export interface ComponentCatalogSpec {
  readonly version: string;
  readonly created_by: string;
  readonly components: Readonly<Record<string, ComponentCatalogEntry>>;
}
