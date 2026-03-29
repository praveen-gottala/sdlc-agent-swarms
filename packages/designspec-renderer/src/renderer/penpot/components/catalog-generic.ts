/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/catalog-generic
 *
 * Generic renderer for catalog entries that don't have a dedicated renderer.
 * Instead of falling back to an empty container, this reads the catalog entry's
 * properties (background, radius, shadow, padding, typography) and renders
 * a styled board with an optional label — covering tabs, progress-bar,
 * search-input, pagination, and any future catalog entries.
 *
 * Structure decision:
 * - If the node has children in the spec → container-like (flex column, auto-height)
 * - If the node has a label/content → leaf-like (flex row, centered label text)
 * - Otherwise → styled container with flex column
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

/** Render any catalog entry generically using its properties. */
export const renderCatalogGeneric: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('gen', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number'
      ? node.width
      : node.width === 'fill' || !node.width
        ? ctx.effectiveWidth
        : 200;
  const height = node.height ?? (cat?.height as number | undefined) ?? (cat?.min_height as number | undefined) ?? 100;
  const bg = node.background ?? (cat?.background as string | undefined) ?? 'transparent';
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 0;
  const pad = (cat?.padding_x as number | undefined) ?? (cat?.padding as number | undefined) ?? 0;
  const padY = (cat?.padding_y as number | undefined) ?? pad;
  const gap = (cat?.gap as number | undefined) ?? 8;

  const catalogId = node.catalogId ?? 'unknown';
  b.comment(`Catalog[${catalogId}]: ${node.id}`);

  emitBoard(b, v, node.id, width, height, bg);

  // Decide layout direction: leaf components (button-like) use row+center,
  // container components use column
  const hasLabel = !!(node.label || node.content);
  if (hasLabel) {
    emitFlex(b, v, 'row', { align: 'center', justify: 'center', gap, px: pad, py: padY });
  } else if (node.layout) {
    emitFlex(b, v, node.layout.dir, {
      align: node.layout.align,
      justify: node.layout.justify,
      gap: node.layout.gap ?? gap,
      px: node.layout.px ?? pad,
      py: node.layout.py ?? padY,
      pt: node.layout.pt,
      pb: node.layout.pb,
    });
  } else {
    emitFlex(b, v, 'column', { gap, px: pad, py: padY });
  }

  if (radius > 0) {
    emitRadius(b, v, radius);
  }

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

  // Label/content text (leaf nodes)
  if (hasLabel) {
    const text = node.label ?? node.content ?? '';
    const typoRole = node.typography ?? (cat?.text_typography as string | undefined) ?? 'body';
    const typo = resolveTypography(typoRole, ctx.tokens);
    const fontSize = typo?.fontSize ?? 14;
    const fontWeight = node.weight ?? (cat?.text_weight as number | undefined) ?? typo?.fontWeight ?? 400;
    const textColor = node.color ?? (cat?.text_color as string | undefined) ?? 'text-primary';

    const tv = makeVar('gtxt', ctx);
    b.line(
      `const ${tv} = makeText(${JSON.stringify(text)}, ${fontSize}, ${fontWeight}, ${tokenRef(textColor)}, 1, ${width});`,
    );
    b.line(`${tv}.name = '${node.id}_label';`);
    emitAppendChild(b, v, tv, 'auto');
  }

  // Append to parent — container-like (auto height) for nodes that will have children
  const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
  emitAppendChild(b, parentVar, v, hSizing, 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
