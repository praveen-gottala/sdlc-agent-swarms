/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/spacer
 * Renderer for the `spacer` accelerator type — an empty gap with fixed height.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, emitBoard, emitAppendChild } from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Default spacer height when none is specified. */
const DEFAULT_SPACER_HEIGHT = 24;

/** Render a spacer node as an empty transparent board with fixed height. */
export const renderSpacer: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('spc', ctx);
  const b = ctx.builder;

  const height = node.height ?? DEFAULT_SPACER_HEIGHT;

  b.comment(`Spacer: ${node.id}`);
  emitBoard(b, v, node.id, ctx.effectiveWidth, height, 'transparent');

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
