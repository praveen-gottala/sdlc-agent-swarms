/**
 * @module @agentforge/designspec-renderer/types/tokens
 * Mirrored design token types for the renderer package.
 * These mirror @agentforge/core types to avoid cross-package dependencies.
 */

/** Primitive color definition (name -> hex). */
export interface PrimitiveColors {
  readonly [name: string]: string;
}

/** Semantic color mapping (role -> primitive color name). */
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

/** A single elevation level. */
export interface ElevationLevel {
  readonly level: number;
  readonly shadow: string;
  readonly description: string;
}

/** Elevation system. */
export interface ElevationSpec {
  readonly levels: readonly ElevationLevel[];
}

/** Border radius tokens. */
export interface BorderSpec {
  readonly radius: Readonly<Record<string, number>>;
}

/** Spacing spec. */
export interface SpacingSpec {
  readonly unit: number;
  readonly scale: readonly number[];
}

/**
 * Subset of DesignTokensSpec needed by the renderer.
 * Only includes what the renderer actually uses — colors, typography, elevation, borders.
 */
export interface RendererTokens {
  readonly colors: ColorSpec;
  readonly typography: TypographySpec;
  readonly elevation: ElevationSpec;
  readonly borders: BorderSpec;
  readonly spacing: SpacingSpec;
}
