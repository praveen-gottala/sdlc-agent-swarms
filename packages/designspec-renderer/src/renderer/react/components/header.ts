/**
 * @module header — Header bar renderer (React).
 * Emits a <header> element with flex row layout.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, flexClasses, sizeClasses, cn } from './shared.js';

/** Render a header node as a semantic <header> element. */
export const renderHeader: ReactComponentRenderer = (node, ctx, renderChildren) => {
  const bg = resolveColorToClass(node.background, 'bg');
  const flex = flexClasses(node.layout, { dir: 'row', align: 'center', justify: 'space-between' });
  const size = sizeClasses('fill', node.height ?? 64);
  const classes = cn(flex, size, bg);

  ctx.builder.open('header', `className="${classes}"`);
  renderChildren();
  ctx.builder.close('header');
};
