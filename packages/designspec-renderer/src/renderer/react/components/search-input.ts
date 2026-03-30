/**
 * @module search-input — Search input field renderer (React).
 * Emits shadcn <Input type="search">.
 */
import type { ReactComponentRenderer } from './types.js';

/** Render a search input. */
export const renderSearchInput: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  ctx.builder.addImport('Input', '@/components/ui/input');
  ctx.builder.selfClosing('Input', `type="search" placeholder="${node.placeholder ?? 'Search...'}"`);
};
