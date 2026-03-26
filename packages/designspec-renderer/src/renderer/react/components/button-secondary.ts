/**
 * @module button-secondary — Secondary outlined button (React).
 */
import type { ReactComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a secondary button with variant="outline". */
export const renderButtonSecondary: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  renderButton(node, ctx, 'outline');
};
