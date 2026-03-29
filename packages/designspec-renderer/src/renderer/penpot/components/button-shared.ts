/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/button-shared
 * Shared renderer logic for all button variants (primary, secondary, ghost).
 */
import type { ResolvedNode } from '../../../types/catalog.js';
import type { RenderContext } from '../render-context.js';
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

/**
 * Render a button node (any variant).
 * Structure: board with flex (row, center, center) containing a label text.
 */
export function renderButton(
  node: ResolvedNode,
  parentVar: string,
  ctx: RenderContext,
): string {
  const v = makeVar('btn', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  // When width is 'fill', use screenWidth as initial resize hint.
  // Penpot flex layout overrides this via layoutChild.horizontalSizing = 'fill'.
  const width =
    typeof node.width === 'number'
      ? node.width
      : node.width === 'fill' || cat?.width === 'fill'
        ? ctx.effectiveWidth
        : 200;
  const height = node.height ?? (cat?.height as number | undefined) ?? 48;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'transparent';
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 0;

  b.comment(`Button: ${node.id}`);
  emitBoard(b, v, node.id, width, height, bg);
  emitFlex(b, v, 'row', { align: 'center', justify: 'center' });
  emitRadius(b, v, radius);

  // Border
  const borderColor = node.border_color ?? (cat?.border_color as string | undefined);
  const borderWidth = node.border_width ?? (cat?.border_width as number | undefined);
  if (borderColor && borderWidth) {
    emitStroke(b, v, borderColor, borderWidth);
  }

  // Shadow
  const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
  if (shadowRef && shadowRef !== 'none') {
    const shadowCss = resolveShadow(shadowRef, ctx.tokens);
    emitShadow(b, v, shadowCss);
  }

  // Label text
  const label = node.label ?? '';
  const typoRole = node.typography ?? (cat?.text_typography as string | undefined) ?? 'body';
  const typo = resolveTypography(typoRole, ctx.tokens);
  const fontSize = typo?.fontSize ?? 14;
  const fontWeight = node.weight ?? (cat?.text_weight as number | undefined) ?? typo?.fontWeight ?? 400;
  const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

  const tv = makeVar('btxt', ctx);
  b.line(
    `const ${tv} = makeText(${JSON.stringify(label)}, ${fontSize}, ${fontWeight}, ${tokenRef(textColor)}, 1, ${width});`,
  );
  b.line(`${tv}.name = '${node.id}_label';`);
  emitAppendChild(b, v, tv, 'auto');

  // Append button to parent
  const hSizing = node.width === 'fill' ? 'fill' : typeof node.width === 'number' ? 'fix' : 'auto';
  emitAppendChild(b, parentVar, v, hSizing, 'fix');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
}
