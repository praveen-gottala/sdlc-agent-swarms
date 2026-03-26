/**
 * @module divider — Horizontal rule renderer (React).
 * Emits a self-closing <hr> with border color at 30% opacity.
 */
import type { ReactComponentRenderer } from './types.js';

/** Render a divider as an <hr> element. */
export const renderDivider: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.selfClosing('hr', 'className="border-[var(--border-default)]/30 w-full"');
};
