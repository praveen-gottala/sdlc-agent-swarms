/**
 * @module divider — Horizontal rule renderer (React).
 * Emits a self-closing <hr> with border color at 30% opacity.
 */
import type { ReactComponentRenderer } from './types.js';
import { marginClasses, cn } from './shared.js';

/** Render a divider as an <hr> element. */
export const renderDivider: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  const margins = marginClasses(node.layout);
  const className = cn(
    'border-[var(--border-default)]/30 w-full',
    margins || undefined,
  );
  ctx.builder.selfClosing('hr', `className="${className}"`);
};
