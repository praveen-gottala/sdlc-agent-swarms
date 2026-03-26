/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/checkbox
 * Renderer for the `checkbox` catalog component.
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

/** Render a checkbox with label. */
export const renderCheckbox: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('chk', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.screenWidth;
  const minHeight = (cat?.min_height as number | undefined) ?? 44;
  const boxSize = (cat?.box_size as number | undefined) ?? 16;
  const boxRadius = (cat?.box_radius as number | undefined) ?? 4;
  const boxBorder = (cat?.box_border as string | undefined) ?? 'border-default';

  // Label typography
  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;
  const textColor = node.color ?? 'text-primary';

  b.comment(`Checkbox: ${node.id}`);

  // Outer row
  emitBoard(b, v, node.id, width, minHeight, 'transparent');
  emitFlex(b, v, 'row', { align: 'center', gap: 12, px: 4 });

  // Checkbox box
  const bv = makeVar('cbox', ctx);
  emitBoard(b, bv, `${node.id}_box`, boxSize, boxSize, 'transparent');
  emitRadius(b, bv, boxRadius);
  emitStroke(b, bv, boxBorder, 1);
  emitAppendChild(b, v, bv, 'auto');

  // Label text
  const label = node.label ?? '';
  const tv = makeVar('ctxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${bodySize}, ${bodyWeight}, ${tokenRef(textColor)}, 1, ${width - boxSize - 20});`,
  );
  b.line(`${tv}.name = '${node.id}_label';`);
  emitAppendChild(b, v, tv, 'fill');

  emitAppendChild(b, parentVar, v, 'fill');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
