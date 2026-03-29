/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/link
 * Renderer for the `link` catalog component — hyperlink text.
 */
import type { ComponentRenderer } from './types.js';
import {
  makeVar,
  tokenRef,
  emitBoard,
  emitFlex,
  emitAppendChild,
} from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';

/** Render a hyperlink text element. */
export const renderLink: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('lnk', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const gap = (cat?.gap as number | undefined) ?? 4;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'cta-primary';
  const minHeight = (cat?.min_height as number | undefined) ?? 44;

  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;

  const label = node.label ?? '';
  const estWidth = Math.max(label.length * bodySize * 0.6 + gap * 2, 40);
  const width = typeof node.width === 'number' ? node.width : estWidth;
  const height = node.height ?? minHeight;

  b.comment(`Link: ${node.id}`);

  emitBoard(b, v, node.id, width, height, 'transparent');
  emitFlex(b, v, 'row', { align: 'center', gap });

  // Link text with underline
  const tv = makeVar('ltxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${bodySize}, ${bodyWeight}, ${tokenRef(textColor)}, 1, ${width});`,
  );
  b.line(`${tv}.name = '${node.id}_text';`);
  b.line(`${tv}.textDecoration = 'underline';`);
  emitAppendChild(b, v, tv, 'auto');

  emitAppendChild(b, parentVar, v, 'auto', 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
