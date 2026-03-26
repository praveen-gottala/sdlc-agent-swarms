/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/button-ghost
 * Renderer for the `button-ghost` catalog component.
 */
import type { ComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a ghost (text-only) button. */
export const renderButtonGhost: ComponentRenderer = (node, parentVar, ctx) =>
  renderButton(node, parentVar, ctx);
