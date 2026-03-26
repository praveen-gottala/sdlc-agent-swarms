/**
 * @module input-text — Text input field renderer (React).
 * Emits label + shadcn <Input> + optional helper text.
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { ReactRenderContext } from '../render-context.js';
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, sizeClasses, radiusClass, typographyClasses, cn } from './shared.js';

/**
 * Shared input field renderer used by input-text and input-currency.
 * @param prefix — Optional prefix string (e.g., '$' for currency).
 */
export function renderInputField(
  node: ResolvedNode,
  ctx: ReactRenderContext,
  prefix?: string,
): void {
  ctx.builder.addImport('Input', '@/components/ui/input');

  const height = node.height ?? 48;
  const radius = node.radius ?? 12;
  const borderColor = resolveColorToClass(node.border_color ?? 'border-default', 'border');
  const inputClasses = cn(
    sizeClasses(undefined, height),
    radiusClass(radius),
    borderColor,
    node.border_width && node.border_width > 1 ? `border-${node.border_width}` : undefined,
  );

  // Wrapper div
  ctx.builder.open('div', 'className="flex flex-col gap-[4px]"');

  // Label
  if (node.label) {
    const labelTypo = typographyClasses('label', ctx.tokens);
    const labelColor = resolveColorToClass('text-secondary', 'text');
    ctx.builder.open('label', `className="${cn(labelTypo, labelColor)}"`);
    ctx.builder.text(node.label);
    ctx.builder.close('label');
  }

  // Input (with optional prefix)
  if (prefix) {
    ctx.builder.open('div', 'className="relative"');
    ctx.builder.open('span', `className="absolute left-3 top-1/2 -translate-y-1/2 ${resolveColorToClass('text-secondary', 'text') ?? ''}"`);
    ctx.builder.text(prefix);
    ctx.builder.close('span');
    ctx.builder.selfClosing('Input', `className="${cn(inputClasses, 'pl-[28px]')}" placeholder="${node.placeholder ?? ''}"`);
    ctx.builder.close('div');
  } else {
    ctx.builder.selfClosing('Input', `className="${inputClasses}" placeholder="${node.placeholder ?? ''}"`);
  }

  // Helper text
  if (node.helper) {
    const helperColor = resolveColorToClass('text-secondary', 'text');
    ctx.builder.open('p', `className="${cn('text-[11px]', helperColor, 'opacity-70')}"`);
    ctx.builder.text(node.helper);
    ctx.builder.close('p');
  }

  ctx.builder.close('div');
}

/** Render a text input field. */
export const renderInputText: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  renderInputField(node, ctx);
};
