/**
 * @module container — Transparent flex wrapper (React).
 * Emits a <div> with flex layout and optional width constraint.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, flexClasses, sizeClasses, cn } from './shared.js';

/** Render a container node as a flex div. */
export const renderContainer: ReactComponentRenderer = (node, ctx, renderChildren) => {
  const bg = resolveColorToClass(node.background, 'bg');
  const flex = flexClasses(node.layout, { dir: 'column' });
  const width = node.width;
  const height = node.height;

  // If width is a number (explicit constraint), center with mx-auto
  const widthCentered = typeof width === 'number' ? 'mx-auto' : undefined;
  const size = sizeClasses(width, height, ctx.screenWidth);
  const classes = cn(flex, size, widthCentered, bg);

  ctx.builder.open('div', `className="${classes}"`);
  renderChildren();
  ctx.builder.close('div');
};
