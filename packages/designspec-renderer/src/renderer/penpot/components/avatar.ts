/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/avatar
 * Renderer for the `avatar` catalog component — a circular initial.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';

/** Render an avatar circle with initials. */
export const renderAvatar: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('avt', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const size = (cat?.size as number | undefined) ?? 36;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'cta-primary';
  const bgOpacity = (cat?.bg_opacity as number | undefined) ?? 0.12;
  const textSize = (cat?.text_size as number | undefined) ?? 14;
  const textWeight = node.weight ?? (cat?.text_weight as number | undefined) ?? 700;

  // Avatar background uses the text color at low opacity
  const bg = node.background ?? textColor;

  b.comment(`Avatar: ${node.id}`);

  emitBoard(b, v, node.id, size, size, 'transparent');
  // Set fill with custom opacity
  b.line(
    `${v}.fills = [{ fillColor: ${tokenRef(bg)}, fillOpacity: ${bgOpacity} }];`,
  );
  emitFlex(b, v, 'row', { align: 'center', justify: 'center' });
  emitRadius(b, v, Math.floor(size / 2));

  // Initials text
  const initials = node.label ?? node.content ?? '?';
  const tv = makeVar('atxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(initials)}, ${textSize}, ${textWeight}, ${tokenRef(textColor)}, 1, ${size});`,
  );
  b.line(`${tv}.name = '${node.id}_initials';`);
  emitAppendChild(b, v, tv, 'auto');

  emitAppendChild(b, parentVar, v, 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
