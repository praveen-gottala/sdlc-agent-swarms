/**
 * @module stat — Metric stat card renderer (React).
 * Emits shadcn <Card> with large value + label.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, typographyClasses, radiusClass, shadowClass, cn } from './shared.js';

/** Render a stat metric card. */
export const renderStat: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Card', '@/components/ui/card');

  const radius = node.radius ?? 20;
  const px = node.padding_x ?? 24;
  const py = node.padding_y ?? 20;
  const shadow = shadowClass(node.shadow ?? node.catalogEntry?.shadow, ctx.tokens);
  const bg = resolveColorToClass(node.background ?? 'surface-primary', 'bg');
  const classes = cn(radiusClass(radius), shadow, bg, `px-[${px}px]`, `py-[${py}px]`);

  ctx.builder.open('Card', `className="${classes}"`);

  // Value (large) — resolve from catalog or default to heading-2
  if (node.value !== undefined) {
    const valueTypo = typographyClasses(node.typography ?? 'heading-2', ctx.tokens);
    const valueColor = resolveColorToClass('text-primary', 'text');
    ctx.builder.open('div', `className="${cn(valueTypo, valueColor)}"`);
    ctx.builder.text(String(node.value));
    ctx.builder.close('div');
  }

  // Label (small)
  if (node.label) {
    const labelColor = resolveColorToClass('text-secondary', 'text');
    ctx.builder.open('div', `className="${cn('text-[14px]', labelColor)}"`);
    ctx.builder.text(node.label);
    ctx.builder.close('div');
  }

  ctx.builder.close('Card');
};
