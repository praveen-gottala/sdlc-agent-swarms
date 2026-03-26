/**
 * @module spacer — Vertical/horizontal spacing primitive (React).
 * Emits a self-closing <div> with a fixed height.
 */
import type { ReactComponentRenderer } from './types.js';

/** Render a spacer as an empty div with fixed height. */
export const renderSpacer: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  const h = node.height ?? 24;
  ctx.builder.selfClosing('div', `className="h-[${h}px]"`);
};
