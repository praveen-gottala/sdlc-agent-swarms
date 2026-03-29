/**
 * @module @agentforge/designspec-renderer/types/tokens
 * Design token types derived from @agentforge/core.
 * Uses `import type` — zero runtime dependency on core.
 */
import type {
  DesignTokensSpec,
  PrimitiveColors, SemanticColors, ColorSpec,
  TypographyScaleEntry, TypographySpec,
  SpacingSpec, BorderSpec, TouchTargetSpec,
  ElevationLevel, ElevationSpec,
  LayoutSpec, ZIndexSpec, OpacitySpec, MotionSpec,
  StateTokensSpec, BorderWidthSpec, TextExtrasSpec,
} from '@agentforge/core';

// Re-export sub-types so renderer modules continue importing from this file
export type {
  PrimitiveColors, SemanticColors, ColorSpec,
  TypographyScaleEntry, TypographySpec,
  SpacingSpec, BorderSpec, TouchTargetSpec,
  ElevationLevel, ElevationSpec,
  ZIndexSpec, OpacitySpec, MotionSpec,
  StateTokensSpec, BorderWidthSpec, TextExtrasSpec,
};

// Rename core's LayoutSpec → LayoutTokenSpec to avoid collision
// with the flex-layout LayoutSpec in design-spec-v2.ts
export type LayoutTokenSpec = LayoutSpec;

// Fields required in DesignTokensSpec but optional in RendererTokens
type OptionalRendererFields = 'touch_targets' | 'layout' | 'z_index' | 'opacity' | 'motion' | 'state';

/**
 * Design tokens consumed by the renderer.
 * Derived from core's DesignTokensSpec: removes version/created_by metadata,
 * makes newer fields optional for backward compatibility.
 * Any new field added to DesignTokensSpec automatically appears here.
 */
export type RendererTokens =
  Omit<DesignTokensSpec, 'version' | 'created_by' | OptionalRendererFields>
  & Partial<Pick<DesignTokensSpec, OptionalRendererFields>>;
