/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/card
 * Renderer for the `card` catalog component — an elevated container.
 * Children are added by the tree walker, not the card renderer itself.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
  emitShadow,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveShadow } from '../../shadows.js';

/** Default card height before flex children expand it. */
const DEFAULT_CARD_HEIGHT = 200;

/** Render a card container. */
export const renderCard: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('card', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.screenWidth;
  const height = node.height ?? DEFAULT_CARD_HEIGHT;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 20;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-primary';
  const pad = node.padding ?? (cat?.padding as number | undefined) ?? 24;

  b.comment(`Card: ${node.id}`);

  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'column', { gap: 8, px: pad, py: pad });
  emitRadius(b, v, radius);

  // Shadow
  const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
  if (shadowRef && shadowRef !== 'none') {
    const shadowCss = resolveShadow(shadowRef, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
  emitAppendChild(b, parentVar, v, hSizing);
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
