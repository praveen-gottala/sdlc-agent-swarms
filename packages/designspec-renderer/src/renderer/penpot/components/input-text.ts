/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/input-text
 * Renderer for the `input-text` catalog component.
 * Also exports renderInputField for reuse by input-currency and select.
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { RenderContext } from '../render-context.js';
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

/**
 * Render an input field with optional prefix and suffix.
 * Structure: outer board (column) -> label text -> input box (row) -> optional helper text.
 *
 * @param prefix - Optional prefix text (e.g., "$" for currency)
 * @param suffix - Optional suffix element (e.g., chevron "v" for select)
 */
export function renderInputField(
  node: ResolvedNode,
  parentVar: string,
  ctx: RenderContext,
  prefix?: string,
  suffix?: string,
): string {
  const v = makeVar('inp', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const height = node.height ?? (cat?.height as number | undefined) ?? 48;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 12;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'surface-primary';
  const borderColor = node.border_color ?? (cat?.border_color as string | undefined) ?? 'border-default';
  const borderWidth = node.border_width ?? (cat?.border_width as number | undefined) ?? 1;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

  // Typography
  const typoRole = node.typography ?? (cat?.text_typography as string | undefined) ?? 'body';
  const typo = resolveTypography(typoRole, ctx.tokens);
  const fontSize = typo?.fontSize ?? 14;
  const fontWeight = typo?.fontWeight ?? 400;

  // Label typography
  const labelTypo = resolveTypography('label', ctx.tokens);
  const labelFontSize = labelTypo?.fontSize ?? 12;
  const labelFontWeight = labelTypo?.fontWeight ?? 500;

  // Total outer height: label + gap + input + optional helper
  const outerHeight = height + labelFontSize + 8 + (node.helper ? 20 : 0);

  b.comment(`Input: ${node.id}`);

  // Outer column board
  emitBoard(b, v, node.id, width, outerHeight, 'transparent');
  emitFlex(b, v, 'column', { gap: 4 });

  // Label text
  if (node.label) {
    const lv = makeVar('ilbl', ctx);
    b.line(
      `const ${lv} = makeText(${JSON.stringify(node.label)}, ${labelFontSize}, ${labelFontWeight}, ${tokenRef('text-secondary')}, 1, ${width});`,
    );
    b.line(`${lv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, lv, 'fill');
  }

  // Input box (row)
  const bx = makeVar('ibox', ctx);
  emitBoard(b, bx, `${node.id}_box`, width, height, bg);
  emitFlex(b, bx, 'row', { align: 'center', px: 12, gap: 4 });
  emitRadius(b, bx, radius);
  emitStroke(b, bx, borderColor, borderWidth);

  // Prefix text (e.g., "$")
  if (prefix) {
    const pv = makeVar('ipfx', ctx);
    b.line(
      `const ${pv} = makeText(${JSON.stringify(prefix)}, ${fontSize}, ${fontWeight}, ${tokenRef(textColor)}, 1, 20);`,
    );
    b.line(`${pv}.name = '${node.id}_prefix';`);
    emitAppendChild(b, bx, pv, 'auto');
  }

  // Placeholder text
  const placeholder = node.placeholder ?? '';
  const pv = makeVar('iph', ctx);
  b.line(
    `const ${pv} = makeText(${JSON.stringify(placeholder)}, ${fontSize}, ${fontWeight}, ${tokenRef(textColor)}, 0.5, ${width - 24});`,
  );
  b.line(`${pv}.name = '${node.id}_placeholder';`);
  emitAppendChild(b, bx, pv, 'fill');

  // Suffix text (e.g., chevron "v")
  if (suffix) {
    const sv = makeVar('isfx', ctx);
    b.line(
      `const ${sv} = makeText(${JSON.stringify(suffix)}, 12, 400, ${tokenRef('text-secondary')}, 1, 20);`,
    );
    b.line(`${sv}.name = '${node.id}_suffix';`);
    emitAppendChild(b, bx, sv, 'auto');
  }

  emitAppendChild(b, v, bx, 'fill');

  // Helper text
  if (node.helper) {
    const smallTypo = resolveTypography('small', ctx.tokens);
    const smallSize = smallTypo?.fontSize ?? 11;
    const smallWeight = smallTypo?.fontWeight ?? 400;
    const hv = makeVar('ihlp', ctx);
    b.line(
      `const ${hv} = makeText(${JSON.stringify(node.helper)}, ${smallSize}, ${smallWeight}, ${tokenRef('text-secondary')}, 0.7, ${width});`,
    );
    b.line(`${hv}.name = '${node.id}_helper';`);
    emitAppendChild(b, v, hv, 'fill');
  }

  // Append to parent — 'auto' so outer wrapper grows to fit label + box + helper
  emitAppendChild(b, parentVar, v, 'fill', 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
}

/** Render an input-text component. */
export const renderInputText: ComponentRenderer = (node, parentVar, ctx) =>
  renderInputField(node, parentVar, ctx);
