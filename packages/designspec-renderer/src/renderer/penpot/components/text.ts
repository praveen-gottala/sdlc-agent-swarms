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
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;

  b.comment(`Text: ${node.id}`);
  b.line(
    `const ${v} = makeText(${JSON.stringify(content)}, ${fontSize}, ${fontWeight}, ${tokenRef(colorToken)}, 1, ${wrapWidth});`,
  );
  b.line(`${v}.name = '${node.id}';`);

  // NOTE: Penpot text shapes are sealed objects — textAlign is NOT a valid
  // property (throws "Cannot add property textAlign, object is not extensible").
  // Text centering in Penpot is handled by the parent container's flex alignment.
  // The textAlign field on NodeSpec is preserved for the React renderer (Tailwind).

  // Text nodes use 'auto' horizontalSizing — they should never stretch beyond
  // their natural content width. In row layouts, 'fill' would cause competing
  // children to split space and clip text (e.g., logo "SplitEa" truncated).
  emitAppendChild(b, parentVar, v, 'auto', 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
