/**
 * @module checkbox — Checkbox toggle renderer (React).
 * Emits shadcn <Checkbox> with label.
 */
import type { ReactComponentRenderer } from './types.js';
import { resolveColorToClass, cn } from './shared.js';

/** Render a checkbox with label. */
export const renderCheckbox: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Checkbox', '@/components/ui/checkbox');

  const labelColor = resolveColorToClass(node.color ?? 'text-primary', 'text');

  ctx.builder.open('div', 'className="flex items-center gap-[12px] min-h-[44px]"');
  ctx.builder.selfClosing('Checkbox', `id="${node.id}"`);
  if (node.label) {
    ctx.builder.open('label', `htmlFor="${node.id}" className="${cn('text-[14px]', labelColor)}"`);
    ctx.builder.text(node.label);
    ctx.builder.close('label');
  }
  ctx.builder.close('div');
};
