/**
 * @module @agentforge/designspec-renderer/renderer/react/components/types
 * React component renderer type definition.
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { ReactRenderContext } from '../render-context.js';

/**
 * A React component renderer.
 *
 * @param node — Resolved node (catalog defaults merged with overrides).
 * @param ctx — Render context with builder, tokens, catalog.
 * @param renderChildren — Callback to render this node's children at the current JSX nesting position.
 */
export type ReactComponentRenderer = (
  node: ResolvedNode,
  ctx: ReactRenderContext,
  renderChildren: () => void,
) => void;
