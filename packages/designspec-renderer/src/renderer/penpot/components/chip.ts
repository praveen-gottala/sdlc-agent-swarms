/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/chip
 * Renderer for the `chip` catalog component — compact pill label for filters/tags.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
  emitRadius,
  emitStroke,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';

/** Render a chip / pill tag. */
export const renderChip: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('chp', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 12;
  const py = node.padding_y ?? (cat?.padding_y as number | undefined) ?? 4;
  const gap = (cat?.gap as number | undefined) ?? 4;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-secondary';
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';
  const borderColor = node.border_color ?? (cat?.border_color as string | undefined) ?? 'border-default';
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 16;
  const minHeight = (cat?.min_height as number | undefined) ?? 44;

  // Label typography
  const labelTypo = resolveTypography('label', ctx.tokens);
  const labelSize = labelTypo?.fontSize ?? 12;
  const labelWeight = labelTypo?.fontWeight ?? 500;

  const label = node.label ?? '';
  const estWidth = Math.max(label.length * labelSize * 0.7 + px * 2, 48);
  const height = node.height ?? minHeight;

  b.comment(`Chip: ${node.id}`);

  emitBoard(b, v, node.id, estWidth, height, bg);
  emitFlex(b, v, 'row', { align: 'center', justify: 'center', gap, px, py });
  emitRadius(b, v, radius);
  emitStroke(b, v, borderColor, 1);

  // Label text
  const tv = makeVar('chtxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${labelSize}, ${labelWeight}, ${tokenRef(textColor)}, 1, ${estWidth - px * 2});`,
  );
  b.line(`${tv}.name = '${node.id}_label';`);
  emitAppendChild(b, v, tv, 'auto');

  emitAppendChild(b, parentVar, v, 'auto', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
