/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/input-currency
 * Renderer for the `input-currency` catalog component.
 * Extends input-text with a "$" prefix.
 */
import type { ComponentRenderer } from './types.js';
import { renderInputField } from './input-text.js';

/** Render an input-currency component (input-text with "$" prefix). */
export const renderInputCurrency: ComponentRenderer = (node, parentVar, ctx) => {
  const prefix = (node.catalogEntry?.prefix as string | undefined) ?? '$';
  return renderInputField(node, parentVar, ctx, prefix);
};
