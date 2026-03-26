/**
 * @module @agentforge/designspec-renderer/renderer/penpot/render-context
 * Shared context passed to all component renderers.
 */
import type { ScriptBuilder } from './script-builder.js';
import type { TokenColorMap } from '../token-resolver.js';
import type { RendererTokens } from '../../types/tokens.js';
import type { CatalogMap } from '../../types/catalog.js';

/** Context available to every component renderer. */
export interface RenderContext {
  /** The script builder to emit lines into. */
  readonly builder: ScriptBuilder;
  /** Resolved color map (semantic -> hex). */
  readonly colorMap: TokenColorMap;
  /** Full design tokens (for typography, shadows, etc.). */
  readonly tokens: RendererTokens;
  /** Component catalog. */
  readonly catalog: CatalogMap;
  /** Screen width from the spec (always the root page width, e.g. 1440). */
  readonly screenWidth: number;
  /**
   * Effective width for the current subtree. Starts at screenWidth, narrows
   * when entering a container with an explicit numeric width (e.g. 600px
   * content column). All descendants should use this instead of screenWidth
   * for board resize widths and text wrap widths.
   */
  effectiveWidth: number;
  /** Counter for generating unique variable names. */
  nextVarId(): number;
  /** Track a variable name -> nodeId for the return map. */
  trackNode(varName: string, nodeId: string): void;
}
