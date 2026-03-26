/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/page
 * Renderer for the `page` accelerator type — the root frame of a screen.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, emitBoard, emitFlex } from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Default page height; auto-expands via flex layout. */
const DEFAULT_PAGE_HEIGHT = 1200;

/** Render a page node as a root board with column flex layout. */
export const renderPage: ComponentRenderer = (node, _parentVar, ctx) => {
  const v = makeVar('root', ctx);
  const b = ctx.builder;
  const width = ctx.screenWidth;
  const height = node.height ?? DEFAULT_PAGE_HEIGHT;

  b.comment(`Page: ${node.id}`);
  emitBoard(b, v, node.id, width, height, node.background);
  b.line(`${v}.x = 0;`);
  b.line(`${v}.y = 0;`);

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
    emitFlex(b, v, 'column', { align: 'center' });
  }

  // Page is root — no appendChild needed
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
