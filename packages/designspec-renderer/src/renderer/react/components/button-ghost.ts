/**
 * @module button-ghost — Ghost text-only button (React).
 */
import type { ReactComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a ghost button with variant="ghost". */
export const renderButtonGhost: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  renderButton(node, ctx, 'ghost');
};
