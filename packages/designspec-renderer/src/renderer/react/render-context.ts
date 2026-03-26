/**
 * @module @agentforge/designspec-renderer/renderer/react/render-context
 * React-specific render context passed to all component renderers.
 */
import type { JsxBuilder } from './jsx-builder.js';
import type { TokenColorMap } from '../token-resolver.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';

/** Context shared across all React component renderers. */
export interface ReactRenderContext {
  /** JSX string builder. */
  readonly builder: JsxBuilder;
  /** Semantic → hex color map (used for Penpot; React uses CSS vars instead). */
  readonly colorMap: TokenColorMap;
  /** Full design token spec. */
  readonly tokens: RendererTokens;
  /** Component catalog. */
  readonly catalog: CatalogMap;
  /** Screen width from the spec (px). */
  readonly screenWidth: number;
}
