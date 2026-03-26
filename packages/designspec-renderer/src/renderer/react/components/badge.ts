/**
 * @module badge — Status badge/pill renderer (React).
 * Emits shadcn <Badge> with label.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, radiusClass, cn } from './shared.js';

/** Render a badge with label text. */
export const renderBadge: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Badge', '@/components/ui/badge');

  const bg = resolveColorToClass(node.background, 'bg');
  const textColor = resolveColorToClass(node.color, 'text');
  const radius = node.radius ?? 8;
  const classes = cn(radiusClass(radius), bg, textColor);

  if (classes) {
    ctx.builder.open('Badge', `className="${classes}"`);
  } else {
    ctx.builder.open('Badge');
  }
  ctx.builder.text(node.label ?? '');
  ctx.builder.close('Badge');
};
