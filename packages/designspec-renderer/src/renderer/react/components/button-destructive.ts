/**
 * @module button-destructive — Destructive/danger button (React).
 */
import type { ReactComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a destructive button with variant="destructive". */
export const renderButtonDestructive: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  renderButton(node, ctx, 'destructive');
};
