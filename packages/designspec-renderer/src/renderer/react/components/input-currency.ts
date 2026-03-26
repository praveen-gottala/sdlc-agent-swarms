/**
 * @module input-currency — Currency input with prefix (React).
 * Extends input-text with a '$' prefix.
 */
import type { ReactComponentRenderer } from './types.js';
import { renderInputField } from './input-text.js';

/** Render a currency input with '$' prefix. */
export const renderInputCurrency: ReactComponentRenderer = (node, ctx, _renderChildren) => {
  const prefix = (node.catalogEntry as Record<string, unknown> | undefined)?.prefix as string ?? '$';
  renderInputField(node, ctx, prefix);
};
