/**
 * @module select — Dropdown select renderer (React).
 * Emits shadcn Select with trigger and placeholder.
 */
import type { ReactComponentRenderer } from './types.js';
import { sizeClasses, radiusClass, cn } from './shared.js';

/** Render a select dropdown using shadcn Select components. */
export const renderSelect: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Select', '@/components/ui/select');
  ctx.builder.addImport('SelectTrigger', '@/components/ui/select');
  ctx.builder.addImport('SelectValue', '@/components/ui/select');

  const height = node.height ?? 48;
  const radius = node.radius ?? 12;

  // Wrapper with label
  ctx.builder.open('div', 'className="flex flex-col gap-[4px]"');

  if (node.label) {
    ctx.builder.open('label', 'className="text-[12px] font-medium text-[var(--text-secondary)]"');
    ctx.builder.text(node.label);
    ctx.builder.close('label');
  }

  ctx.builder.open('Select');
  ctx.builder.open('SelectTrigger', `className="${cn(sizeClasses(undefined, height), radiusClass(radius))}"`);
  ctx.builder.selfClosing('SelectValue', `placeholder="${node.placeholder ?? 'Select...'}"`);
  ctx.builder.close('SelectTrigger');
  ctx.builder.close('Select');

  ctx.builder.close('div');
};
