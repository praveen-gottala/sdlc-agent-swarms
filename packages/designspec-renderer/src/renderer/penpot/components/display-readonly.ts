/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/display-readonly
 * Renderer for the `display-readonly` catalog component.
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
import { resolveTypography } from '../../typography.js';

/** Render a display-readonly component (label + value). */
export const renderDisplayReadonly: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('dsp', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 48;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 8;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-elevated';
  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 16;

  b.comment(`DisplayReadonly: ${node.id}`);

  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'row', { align: 'center', justify: 'space-between', px, gap: 8 });
  emitRadius(b, v, radius);

  // Label typography
  const labelTypo = resolveTypography('label', ctx.tokens);
  const labelSize = labelTypo?.fontSize ?? 12;
  const labelWeight = labelTypo?.fontWeight ?? 500;

  // Value typography
  const typoRole = node.typography ?? (cat?.text_typography as string | undefined) ?? 'heading-3';
  const valTypo = resolveTypography(typoRole, ctx.tokens);
  const valSize = valTypo?.fontSize ?? 16;
  const valWeight = node.weight ?? valTypo?.fontWeight ?? 600;
  const valColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-secondary';

  // Label
  if (node.label) {
    const lv = makeVar('dlbl', ctx);
    b.line(
      `const ${lv} = makeText(${JSON.stringify(node.label)}, ${labelSize}, ${labelWeight}, ${tokenRef('text-secondary')}, 0.7, ${width});`,
    );
    b.line(`${lv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, lv, 'auto');
  }

  // Value
  const displayValue = String(node.value ?? '');
  const vv = makeVar('dval', ctx);
  b.line(
    `const ${vv} = makeText(${JSON.stringify(displayValue)}, ${valSize}, ${valWeight}, ${tokenRef(valColor)}, 1, ${width});`,
  );
  b.line(`${vv}.name = '${node.id}_value';`);
  emitAppendChild(b, v, vv, 'auto');

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
