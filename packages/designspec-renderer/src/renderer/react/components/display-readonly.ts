/**
 * @module display-readonly — Label + value display (React).
 * Emits a flex row with faded label and value text.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, typographyClasses, sizeClasses, radiusClass, cn } from './shared.js';

/** Render a display-readonly field as label + value. */
export const renderDisplayReadonly: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  const height = node.height ?? 48;
  const radius = node.radius ?? 8;
  const bg = resolveColorToClass(node.background ?? 'surface-elevated', 'bg');
  const px = node.padding_x ?? 16;

  ctx.builder.open('div', `className="${cn('flex items-center justify-between', sizeClasses('fill', height), radiusClass(radius), bg, `px-[${px}px]`)}"`);

  // Label (faded)
  if (node.label) {
    const labelColor = resolveColorToClass('text-secondary', 'text');
    ctx.builder.open('span', `className="${cn('text-[14px]', labelColor)}"`);
    ctx.builder.text(node.label);
    ctx.builder.close('span');
  }

  // Value — resolve typography from node/catalog, fallback to heading-3
  if (node.value !== undefined) {
    const cat = node.catalogEntry as Record<string, unknown> | undefined;
    const valueTypo = typographyClasses(node.typography ?? (cat?.text_typography as string | undefined) ?? 'heading-3', ctx.tokens);
    const valueColor = resolveColorToClass('text-primary', 'text');
    ctx.builder.open('span', `className="${cn(valueTypo, valueColor)}"`);
    ctx.builder.text(String(node.value));
    ctx.builder.close('span');
  }

  ctx.builder.close('div');
};
