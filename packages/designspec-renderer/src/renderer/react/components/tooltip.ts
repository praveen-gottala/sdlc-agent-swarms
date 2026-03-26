/**
 * @module tooltip — Inline tooltip/alert renderer (React).
 * Emits shadcn <Alert> with label text.
 */
import type { ReactComponentRenderer } from './types.js';
import { radiusClass, shadowClass, cn } from './shared.js';

/** Render a tooltip as an inline Alert. */
export const renderTooltip: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Alert', '@/components/ui/alert');

  const radius = node.radius ?? 8;
  const shadow = shadowClass(node.shadow ?? node.catalogEntry?.shadow, ctx.tokens);
  const classes = cn(radiusClass(radius), shadow);

  if (classes) {
    ctx.builder.open('Alert', `className="${classes}"`);
  } else {
    ctx.builder.open('Alert');
  }
  ctx.builder.text(node.label ?? '');
  ctx.builder.close('Alert');
};
