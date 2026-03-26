/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/button-secondary
 * Renderer for the `button-secondary` catalog component.
 */
import type { ComponentRenderer } from './types.js';
import { renderButton } from './button-shared.js';

/** Render a secondary (outlined) button. */
export const renderButtonSecondary: ComponentRenderer = (node, parentVar, ctx) =>
  renderButton(node, parentVar, ctx);
