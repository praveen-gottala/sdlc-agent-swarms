/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/stepper
 * Renderer for the `stepper` catalog component.
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
  emitShadow,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';
import { resolveShadow } from '../../shadows.js';

/** Render a stepper (minus - count - plus) control. */
export const renderStepper: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('stp', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 56;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 12;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-elevated';
  const btnSize = (cat?.button_size as number | undefined) ?? 40;

  const minusBg = (cat?.minus_bg as string | undefined) ?? 'surface-secondary';
  const minusBorder = (cat?.minus_border as string | undefined);
  const minusBorderOpacity = (cat?.minus_border_opacity as number | undefined) ?? 1;
  const minusTextColor = (cat?.minus_text_color as string | undefined) ?? 'text-secondary';

  const plusBg = (cat?.plus_bg as string | undefined) ?? 'cta-primary';
  const plusTextColor = (cat?.plus_text_color as string | undefined) ?? 'text-on-cta';

  const countTypoRole = (cat?.count_typography as string | undefined) ?? 'heading-2';
  const countColor = (cat?.count_color as string | undefined) ?? 'text-primary';
  const countTypo = resolveTypography(countTypoRole, ctx.tokens);
  const countFontSize = countTypo?.fontSize ?? 24;
  const countFontWeight = countTypo?.fontWeight ?? 700;

  const hasLabel = !!node.label;

  b.comment(`Stepper: ${node.id}`);

  // Outer board — use space-between when label present (label left, controls right)
  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'row', {
    align: 'center',
    justify: hasLabel ? 'space-between' : 'center',
    px: 20,
  });
  emitRadius(b, v, radius);

  // Shadow
  const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
  if (shadowRef && shadowRef !== 'none') {
    const shadowCss = resolveShadow(shadowRef, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  // Label text (if present) — left side
  if (hasLabel) {
    const lv = makeVar('slbl', ctx);
    b.line(
      `const ${lv} = makeText(${JSON.stringify(node.label)}, 14, 500, ${tokenRef('text-primary')}, 1, ${width});`,
    );
    b.line(`${lv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, lv, 'auto');
  }

  // Controls container (minus + count + plus) — grouped in a nested board
  const ctrlV = makeVar('sctrl', ctx);
  const ctrlGap = 16;
  const ctrlPad = 4;
  emitBoard(b, ctrlV, `${node.id}_controls`, 0, btnSize);
  emitFlex(b, ctrlV, 'row', { align: 'center', justify: 'center', gap: ctrlGap, px: ctrlPad });
  b.line(`${ctrlV}.flex.mainAxisSizing = 'auto';`);
  b.line(`${ctrlV}.fills = [];`);

  // Minus button
  const mv = makeVar('smin', ctx);
  emitBoard(b, mv, `${node.id}_minus`, btnSize, btnSize, minusBg);
  emitFlex(b, mv, 'row', { align: 'center', justify: 'center' });
  emitRadius(b, mv, Math.floor(btnSize / 2));
  if (minusBorder) {
    emitStroke(b, mv, minusBorder, 1, minusBorderOpacity);
  }

  const mtv = makeVar('smtx', ctx);
  b.line(
    `const ${mtv} = makeText('\u2212', 18, 600, ${tokenRef(minusTextColor)}, 1, ${btnSize});`,
  );
  b.line(`${mtv}.name = '${node.id}_minus_text';`);
  emitAppendChild(b, mv, mtv, 'auto');
  // fix/fix so flex cannot crush square buttons to a narrow strip when the row is tight
  emitAppendChild(b, ctrlV, mv, 'fix', 'fix');

  // Count display
  const cv = makeVar('scnt', ctx);
  const countValue = String(node.value ?? '1');
  b.line(
    `const ${cv} = makeText(${JSON.stringify(countValue)}, ${countFontSize}, ${countFontWeight}, ${tokenRef(countColor)}, 1, 60);`,
  );
  b.line(`${cv}.name = '${node.id}_count';`);
  emitAppendChild(b, ctrlV, cv, 'auto');

  // Plus button
  const pv = makeVar('spls', ctx);
  emitBoard(b, pv, `${node.id}_plus`, btnSize, btnSize, plusBg);
  emitFlex(b, pv, 'row', { align: 'center', justify: 'center' });
  emitRadius(b, pv, Math.floor(btnSize / 2));

  const ptv = makeVar('sptx', ctx);
  b.line(
    `const ${ptv} = makeText('+', 18, 600, ${tokenRef(plusTextColor)}, 1, ${btnSize});`,
  );
  b.line(`${ptv}.name = '${node.id}_plus_text';`);
  emitAppendChild(b, pv, ptv, 'auto');
  emitAppendChild(b, ctrlV, pv, 'fix', 'fix');

  // Append controls group to stepper
  emitAppendChild(b, v, ctrlV, 'auto');

  // Append stepper to parent
  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
