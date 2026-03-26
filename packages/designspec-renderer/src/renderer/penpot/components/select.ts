/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/select
 * Renderer for the `select` catalog component.
 * Same as input-text but with a chevron indicator suffix.
 */
import type { ComponentRenderer } from './types.js';
import { renderInputField } from './input-text.js';

/** Render a select component (input-text with chevron suffix). */
export const renderSelect: ComponentRenderer = (node, parentVar, ctx) =>
  renderInputField(node, parentVar, ctx, undefined, '\u25BE');
