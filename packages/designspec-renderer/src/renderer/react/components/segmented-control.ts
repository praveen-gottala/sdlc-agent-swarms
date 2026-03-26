/**
 * @module segmented-control — Pill tab selector (React).
 * Emits shadcn Tabs with TabsList and TabsTrigger per option.
 */
import type { ReactComponentRenderer } from './types.js';
import { radiusClass, cn } from './shared.js';

/** Render a segmented control as shadcn Tabs. */
export const renderSegmentedControl: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Tabs', '@/components/ui/tabs');
  ctx.builder.addImport('TabsList', '@/components/ui/tabs');
  ctx.builder.addImport('TabsTrigger', '@/components/ui/tabs');

  const options = node.options ?? [];
  const selectedOption = options.find(o => o.selected);
  const defaultValue = selectedOption?.label ?? options[0]?.label ?? '';
  const radius = node.radius ?? node.catalogEntry?.radius ?? 24;

  ctx.builder.open('Tabs', `defaultValue="${defaultValue}" className="w-full"`);
  ctx.builder.open('TabsList', `className="${cn('w-full', radiusClass(radius))}"`);

  for (const option of options) {
    ctx.builder.open('TabsTrigger', `value="${option.label}"`);
    ctx.builder.text(option.label);
    ctx.builder.close('TabsTrigger');
  }

  ctx.builder.close('TabsList');
  ctx.builder.close('Tabs');
};
