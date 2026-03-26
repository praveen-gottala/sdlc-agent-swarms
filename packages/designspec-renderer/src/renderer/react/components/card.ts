/**
 * @module card — Card container renderer (React).
 * Emits shadcn <Card> with padding, radius, shadow. Children rendered inside.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, radiusClass, shadowClass, cn } from './shared.js';

/** Render a card container with children. */
export const renderCard: ReactComponentRenderer = (node, ctx, renderChildren) => {
  ctx.builder.addImport('Card', '@/components/ui/card');

  const radius = node.radius ?? 20;
  const padding = node.padding ?? node.catalogEntry?.padding ?? 24;
  const shadow = shadowClass(node.shadow ?? node.catalogEntry?.shadow, ctx.tokens);
  const bg = resolveColorToClass(node.background ?? 'surface-primary', 'bg');
  const classes = cn(radiusClass(radius), shadow, bg, `p-[${padding}px]`);

  ctx.builder.open('Card', `className="${classes}"`);
  renderChildren();
  ctx.builder.close('Card');
};
