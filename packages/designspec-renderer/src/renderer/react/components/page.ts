/**
 * @module page — Root page renderer (React).
 * Emits a min-h-screen div with background color and flex layout.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, flexClasses, cn } from './shared.js';

/** Render a page node as the root div wrapper. */
export const renderPage: ReactComponentRenderer = (node, ctx, renderChildren) => {
  const bg = resolveColorToClass(node.background ?? 'background-primary', 'bg');
  const flex = flexClasses(node.layout, { dir: 'column', align: 'center' });
  const classes = cn('min-h-screen', flex, bg);

  ctx.builder.open('div', `className="${classes}"`);
  renderChildren();
  ctx.builder.close('div');
};
