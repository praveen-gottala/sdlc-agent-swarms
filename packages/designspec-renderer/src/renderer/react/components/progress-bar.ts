/**
 * @module progress-bar — Progress bar renderer (React).
 * Emits shadcn <Progress> with value.
 */
import type { ReactComponentRenderer } from './types.js';
import { sizeClasses } from './shared.js';

/** Render a progress bar. */
export const renderProgressBar: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Progress', '@/components/ui/progress');
  const value = typeof node.value === 'number' ? node.value : 0;
  ctx.builder.selfClosing('Progress', `value={${value}} className="${sizeClasses(node.width, undefined)}"`);
};
