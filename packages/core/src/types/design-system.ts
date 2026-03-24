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

/** A single component variant's token bindings. Color values reference semantic or primitive token names. */
export interface ComponentVariantTokens {
  readonly [key: string]: string | number | undefined;
}

/**
 * Component-level token bindings (variant → token references).
 * @deprecated Use ComponentCatalogSpec for structured component definitions.
 * This interface only captures variant token bindings, not anatomy or states.
 * Retained for backward compatibility with existing design-tokens.yaml files.
 */
export interface ComponentTokens {
  readonly button?: {
    readonly primary?: ComponentVariantTokens;
    readonly secondary?: ComponentVariantTokens;
    readonly ghost?: ComponentVariantTokens;
  };
  readonly card?: {
    readonly default?: ComponentVariantTokens;
    readonly highlighted?: ComponentVariantTokens;
  };
  readonly input?: {
    readonly default?: ComponentVariantTokens;
    readonly focus?: ComponentVariantTokens;
    readonly error?: ComponentVariantTokens;
  };
  readonly tab_bar?: {
    readonly active?: ComponentVariantTokens;
    readonly inactive?: ComponentVariantTokens;
  };
  readonly badge?: {
    readonly success?: ComponentVariantTokens;
    readonly warning?: ComponentVariantTokens;
    readonly error?: ComponentVariantTokens;
    readonly info?: ComponentVariantTokens;
  };
  readonly avatar?: {
    readonly default?: ComponentVariantTokens;
  };
  readonly progress_bar?: {
    readonly track?: ComponentVariantTokens;
    readonly fill?: ComponentVariantTokens;
  };
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
  readonly components?: ComponentTokens;
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
}

/** A single component entry in the catalog. */
export interface ComponentCatalogEntry {
  readonly description: string;
  readonly category: string;
  readonly anatomy: readonly ComponentAnatomySlot[];
  readonly states: Readonly<Record<string, ComponentStateTokens>>;
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
