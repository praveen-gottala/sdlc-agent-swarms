/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/section
 * Renderer for the `section` accelerator type — a container with a heading title.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, tokenRef, emitBoard, emitFlex, emitAppendChild } from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';

/** Default section height before flex children expand it. */
const DEFAULT_SECTION_HEIGHT = 200;

/** Render a section node as a board with an optional title text child. */
export const renderSection: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('sec', ctx);
  const b = ctx.builder;

  const width =
    typeof node.width === 'number'
      ? node.width
      : ctx.screenWidth;
  const height = node.height ?? DEFAULT_SECTION_HEIGHT;

  b.comment(`Section: ${node.id}`);
  emitBoard(b, v, node.id, width, height, node.background ?? 'transparent');

  if (node.layout) {
    emitFlex(b, v, node.layout.dir, {
      align: node.layout.align,
      justify: node.layout.justify,
      gap: node.layout.gap,
      px: node.layout.px,
      py: node.layout.py,
      pt: node.layout.pt,
      pb: node.layout.pb,
    });
  } else {
    emitFlex(b, v, 'column', { gap: 12, px: 0, py: 0 });
  }

  // Emit title text if present
  if (node.title) {
    const titleVar = makeVar('secTitle', ctx);
    const typo = resolveTypography('heading-3', ctx.tokens);
    const fontSize = typo?.fontSize ?? 18;
    const fontWeight = typo?.fontWeight ?? 600;
    const colorToken = node.color ?? 'text-primary';

    b.line(
      `const ${titleVar} = makeText(${JSON.stringify(node.title)}, ${fontSize}, ${fontWeight}, ${tokenRef(colorToken)}, 1, ${width});`,
    );
    b.line(`${titleVar}.name = '${node.id}-title';`);
    emitAppendChild(b, v, titleVar, 'fill');
  }

  const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
  emitAppendChild(b, parentVar, v, hSizing);
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
