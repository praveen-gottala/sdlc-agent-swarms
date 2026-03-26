/**
 * @module button-primary — Primary CTA button (React).
 */
import type { ReactComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a primary button with variant="default". */
export const renderButtonPrimary: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  renderButton(node, ctx, 'default');
};
