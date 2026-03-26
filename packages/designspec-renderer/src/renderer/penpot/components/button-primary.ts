/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/button-primary
 * Renderer for the `button-primary` catalog component.
 */
import type { ComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a primary button. */
export const renderButtonPrimary: ComponentRenderer = (node, parentVar, ctx) =>
  renderButton(node, parentVar, ctx);
