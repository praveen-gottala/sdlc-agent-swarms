/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/text
 * Renderer for the `text` accelerator type — a styled text shape.
 */
import type { ComponentRenderer } from './types.js';
import { makeVar, tokenRef, emitAppendChild } from './shared.js';
import { emitPluginData } from '../plugin-data.js';
import { resolveTypography } from '../../typography.js';

/** Render a text node using the makeText helper from the preamble. */
export const renderText: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('txt', ctx);
  const b = ctx.builder;
  const content = node.content ?? node.label ?? '';

  // Resolve typography
  const typo = node.typography
    ? resolveTypography(node.typography, ctx.tokens)
    : undefined;
  const fontSize = typo?.fontSize ?? 14;
  const fontWeight = node.weight ?? typo?.fontWeight ?? 400;
  const colorToken = node.color ?? 'text-primary';

  // Determine wrap width from node width or screen
  const wrapWidth =
    typeof node.width === 'number' ? node.width : ctx.screenWidth;

  b.comment(`Text: ${node.id}`);
  b.line(
    `const ${v} = makeText(${JSON.stringify(content)}, ${fontSize}, ${fontWeight}, ${tokenRef(colorToken)}, 1, ${wrapWidth});`,
  );
  b.line(`${v}.name = '${node.id}';`);

  emitAppendChild(b, parentVar, v, 'fill');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
