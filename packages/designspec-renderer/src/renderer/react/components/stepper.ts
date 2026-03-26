/**
 * @module stepper — Increment/decrement stepper (React).
 * Renders label left-aligned, controls (minus/count/plus) right-aligned
 * with justify-between — per Lesson 4 from lessons-learned.md.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, radiusClass, sizeClasses, cn } from './shared.js';

/** Render a stepper with label + grouped controls. */
export const renderStepper: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  const cat = node.catalogEntry as Record<string, unknown> | undefined;
  const height = node.height ?? (cat?.height as number | undefined) ?? 56;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 12;
  const bg = resolveColorToClass(node.background ?? (cat?.background as string | undefined) ?? 'surface-elevated', 'bg');
  const buttonSize = (cat?.button_size as number | undefined) ?? 40;

  // Outer container: label left, controls right
  ctx.builder.open('div', `className="${cn('flex items-center justify-between', sizeClasses('fill', height), radiusClass(radius), bg, 'px-[16px]')}"`);

  // Label
  if (node.label) {
    const labelColor = resolveColorToClass('text-primary', 'text');
    ctx.builder.open('span', `className="${cn('text-[14px] font-medium', labelColor)}"`);
    ctx.builder.text(node.label);
    ctx.builder.close('span');
  }

  // Controls group: minus / count / plus
  ctx.builder.open('div', 'className="flex items-center gap-[12px]"');

  // Minus button
  const minusBg = resolveColorToClass((cat?.minus_bg as string | undefined) ?? 'surface-secondary', 'bg');
  ctx.builder.open('button', `className="${cn(`w-[${buttonSize}px] h-[${buttonSize}px]`, 'rounded-full flex items-center justify-center', minusBg)}"`);
  ctx.builder.text('\u2212');
  ctx.builder.close('button');

  // Count display
  const countColor = resolveColorToClass((cat?.count_color as string | undefined) ?? 'text-primary', 'text');
  ctx.builder.open('span', `className="${cn('text-[24px] font-bold', countColor)}"`);
  ctx.builder.text(String(node.value ?? 0));
  ctx.builder.close('span');

  // Plus button
  const plusBg = resolveColorToClass((cat?.plus_bg as string | undefined) ?? 'cta-primary', 'bg');
  const plusText = resolveColorToClass((cat?.plus_text_color as string | undefined) ?? 'text-on-cta', 'text');
  ctx.builder.open('button', `className="${cn(`w-[${buttonSize}px] h-[${buttonSize}px]`, 'rounded-full flex items-center justify-center', plusBg, plusText)}"`);
  ctx.builder.text('+');
  ctx.builder.close('button');

  ctx.builder.close('div'); // controls group
  ctx.builder.close('div'); // outer
};
