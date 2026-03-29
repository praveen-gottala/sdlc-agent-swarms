/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/button-destructive
 * Renderer for the `button-destructive` catalog component.
 */
import type { ComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a destructive action button. */
export const renderButtonDestructive: ComponentRenderer = (node, parentVar, ctx) =>
  renderButton(node, parentVar, ctx);
