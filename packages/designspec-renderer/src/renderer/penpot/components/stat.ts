/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/stat
 * Renderer for the `stat` catalog component — a metric card with label and large value.
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
import { resolveTypography } from '../../typography.js';
import { resolveShadow } from '../../shadows.js';

/** Render a stat metric card. */
export const renderStat: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('stat', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.screenWidth;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 20;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-primary';
  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 24;
  const py = node.padding_y ?? (cat?.padding_y as number | undefined) ?? 20;

  // Label typography
  const labelTypo = resolveTypography('label', ctx.tokens);
  const labelSize = labelTypo?.fontSize ?? 12;
  const labelWeight = labelTypo?.fontWeight ?? 500;

  // Value typography (large)
  const valTypo = resolveTypography('heading-2', ctx.tokens);
  const valSize = valTypo?.fontSize ?? 24;
  const valWeight = valTypo?.fontWeight ?? 700;
  const valColor = node.color ?? 'text-primary';

  const height = py * 2 + labelSize + valSize + 8;

  b.comment(`Stat: ${node.id}`);

  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'column', { gap: 4, px, py });
  emitRadius(b, v, radius);

  // Shadow
  const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
  if (shadowRef && shadowRef !== 'none') {
    const shadowCss = resolveShadow(shadowRef, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  // Label
  if (node.label) {
    const lv = makeVar('slbl', ctx);
    b.line(
      `const ${lv} = makeText(${JSON.stringify(node.label)}, ${labelSize}, ${labelWeight}, ${tokenRef('text-secondary')}, 0.7, ${width});`,
    );
    b.line(`${lv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, lv, 'fill');
  }

  // Value
  const displayValue = String(node.value ?? '');
  const vv = makeVar('sval', ctx);
  b.line(
    `const ${vv} = makeText(${JSON.stringify(displayValue)}, ${valSize}, ${valWeight}, ${tokenRef(valColor)}, 1, ${width});`,
  );
  b.line(`${vv}.name = '${node.id}_value';`);
  emitAppendChild(b, v, vv, 'fill');

  // Trend text (optional, from title field)
  if (node.title) {
    const tv = makeVar('strn', ctx);
    b.line(
      `const ${tv} = makeText(${JSON.stringify(node.title)}, 11, 500, ${tokenRef('text-secondary')}, 0.7, ${width});`,
    );
    b.line(`${tv}.name = '${node.id}_trend';`);
    emitAppendChild(b, v, tv, 'fill');
  }

  emitAppendChild(b, parentVar, v, 'fill');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
