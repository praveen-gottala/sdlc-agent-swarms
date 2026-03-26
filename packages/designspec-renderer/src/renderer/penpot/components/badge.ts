/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/badge
 * Renderer for the `badge` catalog component.
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

/** Render a badge / status pill. */
export const renderBadge: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('bdg', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const height = node.height ?? (cat?.height as number | undefined) ?? 24;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 8;
  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 8;
  const py = node.padding_y ?? (cat?.padding_y as number | undefined) ?? 2;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-elevated';

  const textSize = (cat?.text_size as number | undefined) ?? 11;
  const textWeight = node.weight ?? (cat?.text_weight as number | undefined) ?? 500;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

  const label = node.label ?? '';
  // Estimate width from label length
  const estWidth = Math.max(label.length * textSize * 0.7 + px * 2, 40);

  b.comment(`Badge: ${node.id}`);

  emitBoard(b, v, node.id, estWidth, height, bg);
  emitFlex(b, v, 'row', { align: 'center', justify: 'center', px, py });
  emitRadius(b, v, radius);

  const tv = makeVar('btxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${textSize}, ${textWeight}, ${tokenRef(textColor)}, 1, ${estWidth});`,
  );
  b.line(`${tv}.name = '${node.id}_text';`);
  emitAppendChild(b, v, tv, 'auto');

  emitAppendChild(b, parentVar, v, 'auto', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
