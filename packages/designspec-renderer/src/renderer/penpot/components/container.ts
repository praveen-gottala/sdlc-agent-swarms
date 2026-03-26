/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/container
 * Renderer for the `container` accelerator type — a transparent flex wrapper.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, emitBoard, emitFlex, emitAppendChild, emitRadius, emitShadow } from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveShadow } from '../../shadows.js';

/** Default container height before flex children expand it. */
const DEFAULT_CONTAINER_HEIGHT = 100;

/** Render a container node as a transparent board with flex layout. */
export const renderContainer: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('ctr', ctx);
  const b = ctx.builder;

  const width =
    typeof node.width === 'number'
      ? node.width
      : ctx.effectiveWidth;
  const height = node.height ?? DEFAULT_CONTAINER_HEIGHT;

  b.comment(`Container: ${node.id}`);
  emitBoard(b, v, node.id, width, height, node.background ?? 'transparent');

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
    emitFlex(b, v, 'column');
  }

  if (node.radius) {
    emitRadius(b, v, node.radius);
  }

  if (node.shadow && node.shadow !== 'none') {
    const shadowCss = resolveShadow(node.shadow, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
  emitAppendChild(b, parentVar, v, hSizing, 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
