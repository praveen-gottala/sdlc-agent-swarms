/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/tooltip
 * Renderer for the `tooltip` catalog component — an inline info row.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
  emitShadow,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveShadow } from '../../shadows.js';

/** Render a tooltip / inline info row. */
export const renderTooltip: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('tip', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.screenWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 40;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 8;
  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 16;
  const bg = node.background ?? 'surface-elevated';

  const iconSize = (cat?.icon_size as number | undefined) ?? 16;
  const textSize = (cat?.text_size as number | undefined) ?? 11;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

  b.comment(`Tooltip: ${node.id}`);

  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'row', { align: 'center', gap: 8, px });
  emitRadius(b, v, radius);

  // Shadow
  const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
  if (shadowRef && shadowRef !== 'none') {
    const shadowCss = resolveShadow(shadowRef, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  // Icon placeholder (circle)
  const iv = makeVar('tico', ctx);
  emitBoard(b, iv, `${node.id}_icon`, iconSize, iconSize, 'text-secondary');
  emitRadius(b, iv, Math.floor(iconSize / 2));
  emitAppendChild(b, v, iv, 'auto');

  // Message text
  const message = node.content ?? node.label ?? '';
  const tv = makeVar('ttxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(message)}, ${textSize}, 400, ${tokenRef(textColor)}, 1, ${width - px * 2 - iconSize - 8});`,
  );
  b.line(`${tv}.name = '${node.id}_text';`);
  emitAppendChild(b, v, tv, 'fill');

  emitAppendChild(b, parentVar, v, 'fill');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
