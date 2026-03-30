/**
 * @module chip — Chip/tag renderer (React).
 * Emits shadcn <Badge variant="outline"> with label.
 */
import type { ReactComponentRenderer } from './types.js';

/** Render a chip as an outlined badge. */
export const renderChip: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Badge', '@/components/ui/badge');
  ctx.builder.open('Badge', 'variant="outline"');
  ctx.builder.text(node.label ?? '');
  ctx.builder.close('Badge');
};
