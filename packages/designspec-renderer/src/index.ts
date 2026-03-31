/**
 * @module @agentforge/designspec-renderer
 *
 * DesignSpec v2 renderer — converts flat JSON adjacency lists
 * to deterministic Penpot scripts and React/HTML output.
 *
 * Phase 1: Types, catalog, token resolution, tree building, validation.
 * Phase 2: Penpot renderer (renderToScript).
 * Phase 3: React renderer (renderToJSX).
 */

// ─── Types ────────────────────────────────────────────────
export type { Result, OkResult, ErrResult, ResultError } from './types/result.js';
export { Ok, Err } from './types/result.js';

export type {
  DesignSpecV2,
  NodeSpec,
  AcceleratorType,
  LayoutSpec,
  SegmentedOption,
} from './types/design-spec-v2.js';

export type {
  CatalogEntry,
  CatalogMap,
  ResolvedNode,
  TreeNode,
} from './types/catalog.js';

export type {
  RendererTokens,
  ColorSpec,
  TypographySpec,
  TypographyScaleEntry,
  ElevationSpec,
  ElevationLevel,
  BorderSpec,
  SpacingSpec,
  PrimitiveColors,
  SemanticColors,
  TouchTargetSpec,
  LayoutTokenSpec,
  ZIndexSpec,
  OpacitySpec,
  MotionSpec,
  StateTokensSpec,
  BorderWidthSpec,
  TextExtrasSpec,
} from './types/tokens.js';

export type {
  ValidationResult,
  ValidationIssue,
  ValidationSeverity,
} from './types/validation.js';

// ─── Catalog ──────────────────────────────────────────────
export { loadCatalogForRenderer } from './catalog/loader.js';
export type { RawCatalogSpec, RawCatalogEntry } from './catalog/loader.js';
export { resolveNode } from './catalog/resolver.js';

// ─── Renderer Utilities ───────────────────────────────────
export { buildTree } from './renderer/tree-builder.js';
export { buildTokenMap, resolveColor } from './renderer/token-resolver.js';
export type { TokenColorMap } from './renderer/token-resolver.js';
export { resolveTypography } from './renderer/typography.js';
export type { ResolvedTypography } from './renderer/typography.js';
export { resolveShadow } from './renderer/shadows.js';

// ─── Validation ───────────────────────────────────────────
export { validateDesignSpec } from './validation/validate.js';
export { validateTokenReferences } from './validation/validate-token-refs.js';

// ─── Penpot Renderer ──────────────────────────────────────
export { renderToScript, renderToScriptChunks } from './renderer/penpot/index.js';
export type { RenderResult, ChunkedRenderResult } from './renderer/penpot/index.js';

// ─── React Renderer ──────────────────────────────────────
export { renderToJSX } from './renderer/react/index.js';
export type { JsxRenderResult } from './renderer/react/index.js';

// ─── SDK Tools ───────────────────────────────────────────
export { SUBMIT_DESIGN_TOOL } from './sdk/submit-design-tool.js';

// ─── Browser Renderer ───────────────────────────────────
export { screenshotDesignSpec } from './renderer/browser/screenshot.js';
export type { ScreenshotOptions, ScreenshotResult } from './renderer/browser/screenshot.js';
export { generateCssVariables } from './renderer/browser/generate-css-variables.js';

// ─── Browser Correction Pipeline ────────────────────────
export { extractDOMLayout } from './renderer/browser/dom-extraction.js';
export type { DOMLayoutData, DOMNodeLayout } from './renderer/browser/dom-extraction.js';
export { checkMechanicalIssues, applyMechanicalFixes, OVERLAP_THRESHOLD_PX, OVERFLOW_THRESHOLD_PX, COLLAPSE_HEIGHT_PX, BADGE_WIDTH_RATIO, TEXT_CLIP_TOLERANCE_PX } from './renderer/browser/mechanical-fixes.js';
export type { MechanicalIssue, MechanicalCheckResult } from './renderer/browser/mechanical-fixes.js';
export { openBrowserSession } from './renderer/browser/screenshot-session.js';
export type { BrowserSession } from './renderer/browser/screenshot-session.js';
export { runInteractivePreview, openInteractivePreview } from './renderer/browser/interactive-preview.js';
export type { UserFeedbackTag, InteractivePreviewResult, InteractivePreviewSession } from './renderer/browser/interactive-preview.js';

// ─── Renderer Introspection ─────────────────────────────
export { getRenderableCatalogIds, registerCatalogRenderer } from './renderer/penpot/components/index.js';
export { generateRenderer, generateCatalogEntry } from './renderer/penpot/components/catalog-dynamic.js';
export type { DynamicCatalogSource, AnatomySlot } from './renderer/penpot/components/catalog-dynamic.js';
