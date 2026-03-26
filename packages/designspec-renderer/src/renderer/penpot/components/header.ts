/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/header
 * Renderer for the `header` accelerator type — a full-width row banner.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, emitBoard, emitFlex, emitAppendChild } from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Default header height. */
const DEFAULT_HEADER_HEIGHT = 64;

/** Render a header node as a full-width board with row layout. */
export const renderHeader: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('hdr', ctx);
  const b = ctx.builder;

  const width = ctx.screenWidth;
  const height = node.height ?? DEFAULT_HEADER_HEIGHT;

  b.comment(`Header: ${node.id}`);
  emitBoard(b, v, node.id, width, height, node.background ?? 'surface-primary');

  if (node.layout) {
    emitFlex(b, v, node.layout.dir, {
      align: node.layout.align,
      justify: node.layout.justify,
      gap: node.layout.gap,
      px: node.layout.px,
      py: node.layout.py,
      pt: node.layout.pt,
      pb: node.layout.pb,
    });
  } else {
    emitFlex(b, v, 'row', { align: 'center', justify: 'space-between', px: 16 });
  }

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
