/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/alert
 * Renderer for the `alert` catalog component — notification banner.
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

/** Render an alert / notification banner. */
export const renderAlert: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('alrt', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const px = node.padding_x ?? (cat?.padding_x as number | undefined) ?? 16;
  const py = node.padding_y ?? (cat?.padding_y as number | undefined) ?? 12;
  const gap = (cat?.gap as number | undefined) ?? 8;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'cta-primary';
  const bgOpacity = (cat?.opacity as number | undefined) ?? 0.1;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';
  const borderColor = node.border_color ?? (cat?.border_color as string | undefined) ?? 'cta-primary';
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 12;

  const width = typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const minHeight = (cat?.min_height as number | undefined) ?? 48;

  // Typography
  const labelTypo = resolveTypography('label', ctx.tokens);
  const labelSize = labelTypo?.fontSize ?? 14;
  const labelWeight = labelTypo?.fontWeight ?? 600;
  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;

  const label = node.label ?? node.title ?? '';
  const content = node.content ?? '';
  const height = node.height ?? Math.max(minHeight, py * 2 + (label ? labelSize + gap : 0) + (content ? bodySize * 2 : 0));

  b.comment(`Alert: ${node.id}`);

  // Outer board with semi-transparent fill
  emitBoard(b, v, node.id, width, height);
  b.line(
    `${v}.fills = [{ fillColor: ${tokenRef(bg)}, fillOpacity: ${bgOpacity} }];`,
  );
  emitFlex(b, v, 'column', { align: 'start', gap, px, py });
  emitRadius(b, v, radius);
  emitStroke(b, v, borderColor, 1);

  // Icon placeholder (small colored dot)
  const iconRow = makeVar('arow', ctx);
  emitBoard(b, iconRow, `${node.id}_row`, width - px * 2, labelSize + 4, 'transparent');
  emitFlex(b, iconRow, 'row', { align: 'center', gap: 8 });
  emitAppendChild(b, v, iconRow, 'fill', 'fix');

  const iv = makeVar('aico', ctx);
  emitBoard(b, iv, `${node.id}_icon`, 8, 8, borderColor);
  emitRadius(b, iv, 4);
  emitAppendChild(b, iconRow, iv, 'fix', 'fix');

  // Title text
  if (label) {
    const tv = makeVar('atit', ctx);
    b.line(
      `const ${tv} = makeText(${JSON.stringify(label)}, ${labelSize}, ${labelWeight}, ${tokenRef(textColor)}, 1, ${width - px * 2 - 24});`,
    );
    b.line(`${tv}.name = '${node.id}_title';`);
    emitAppendChild(b, iconRow, tv, 'fill');
  }

  // Message text
  if (content) {
    const mv = makeVar('amsg', ctx);
    const wrapWidth = width - px * 2;
    b.line(
      `const ${mv} = makeText(${JSON.stringify(content)}, ${bodySize}, ${bodyWeight}, ${tokenRef(textColor)}, 1, ${wrapWidth});`,
    );
    b.line(`${mv}.name = '${node.id}_message';`);
    emitAppendChild(b, v, mv, 'fill');
  }

  emitAppendChild(b, parentVar, v, 'fill', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
