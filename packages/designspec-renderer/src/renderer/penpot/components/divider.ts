/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/divider
 * Renderer for the `divider` accelerator type — a 1px horizontal rule.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, tokenRef, emitBoard, emitAppendChild } from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Render a divider node as a 1px-high board with border-default fill at 0.3 opacity. */
export const renderDivider: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('div', ctx);
  const b = ctx.builder;

  const colorToken = node.background ?? node.border_color ?? 'border-default';

  b.comment(`Divider: ${node.id}`);
  emitBoard(b, v, node.id, ctx.effectiveWidth, 1);
  b.line(
    `${v}.fills = [{ fillColor: ${tokenRef(colorToken)}, fillOpacity: 0.5 }];`,
  );

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
