/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/types
 * Shared type for component renderer functions.
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { RenderContext } from '../render-context.js';

/** A component renderer function. Returns the JS variable name for the created shape. */
export type ComponentRenderer = (
  node: ResolvedNode,
  parentVar: string,
  ctx: RenderContext,
) => string;
