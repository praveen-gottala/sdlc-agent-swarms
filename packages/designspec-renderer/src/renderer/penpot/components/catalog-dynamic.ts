/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/catalog-dynamic
 *
 * Dynamically generates Penpot renderers for catalog components that don't have
 * hand-written renderers. Reads the component's anatomy from the ComponentCatalogSpec
 * to determine the structural layout.
 *
 * Anatomy patterns mapped to Penpot structures:
 * - Components with children in the spec → container (column flex, auto-height)
 * - Components with label/content anatomy → leaf (row flex, centered label)
 * - Components with track+fill anatomy → progress bar (row with fill sub-board)
 * - Components with input_field anatomy → input-like (column: label → input-box → helper)
 * - Components with tab_list anatomy → tab bar (row of text items with active indicator)
 * - Components with items/page_numbers anatomy → row of action items
 */
import type { ComponentRenderer } from './types.js';
import type { CatalogEntry } from '../../../types/catalog.js';
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

/** Anatomy slot from the raw catalog YAML. */
export interface AnatomySlot {
  readonly name: string;
  readonly contents: string;
  readonly typography_role?: string;
  readonly optional?: boolean;
}

/** Minimal raw catalog entry needed for dynamic generation. */
export interface DynamicCatalogSource {
  readonly description: string;
  readonly category: string;
  readonly min_height?: number;
  readonly anatomy: readonly AnatomySlot[];
  readonly states: Readonly<Record<string, { bg: string; text: string; border?: string; border_width?: number }>>;
  readonly token_bindings?: Readonly<Record<string, string | number | undefined>>;
  readonly spacing?: { padding?: string; internal_gap?: string };
}

/** Detect the structural pattern from anatomy slot names. */
type AnatomyPattern = 'tab-bar' | 'progress-bar' | 'search-input' | 'pagination' | 'input-like' | 'container' | 'leaf';

function detectPattern(anatomy: readonly AnatomySlot[]): AnatomyPattern {
  const names = new Set(anatomy.map(s => s.name));
  if (names.has('tab_list')) return 'tab-bar';
  if (names.has('track') && names.has('fill')) return 'progress-bar';
  if (names.has('search_icon') || names.has('input_field')) return 'search-input';
  if (names.has('prev_button') || names.has('page_numbers') || names.has('next_button')) return 'pagination';
  if (names.has('label') && (names.has('input_field') || names.has('textarea'))) return 'input-like';
  if (anatomy.some(s => s.contents.includes('content area') || s.contents.includes('nested'))) return 'container';
  return 'leaf';
}

/**
 * Generate a ComponentRenderer function for a catalog entry based on its anatomy.
 * The returned function follows the same pattern as hand-written renderers.
 */
export function generateRenderer(
  catalogId: string,
  source: DynamicCatalogSource,
): ComponentRenderer {
  const pattern = detectPattern(source.anatomy);

  return (node, parentVar, ctx) => {
    const v = makeVar('dyn', ctx);
    const b = ctx.builder;
    const cat = node.catalogEntry;

    const width = typeof node.width === 'number' ? node.width
      : node.width === 'fill' || !node.width ? ctx.effectiveWidth : 200;
    const bg = node.background ?? (cat?.background as string | undefined) ?? source.states.default?.bg ?? 'transparent';
    const radius = node.radius ?? (cat?.radius as number | undefined) ?? 0;
    const minHeight = source.min_height ?? 44;

    b.comment(`Dynamic[${catalogId}/${pattern}]: ${node.id}`);

    switch (pattern) {
      case 'tab-bar': {
        const height = node.height ?? minHeight;
        const borderColor = source.states.active?.border ?? 'cta-primary';
        emitBoard(b, v, node.id, width, height, bg);
        emitFlex(b, v, 'row', { align: 'center', gap: 0 });
        if (radius > 0) emitRadius(b, v, radius);

        // If the node has `items` or `options`, render tab items from data
        const items = node.items ?? node.options;
        if (items && Array.isArray(items)) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i] as Record<string, unknown>;
            const label = String(item.label ?? item.name ?? `Tab ${i + 1}`);
            const isActive = !!(item.selected ?? item.active ?? (i === 0));
            const tabV = makeVar('tab', ctx);
            const tabH = height;
            const tabW = Math.max(label.length * 10 + 32, 80);

            emitBoard(b, tabV, `${node.id}_tab_${i}`, tabW, tabH, 'transparent');
            emitFlex(b, tabV, 'column', { align: 'center', justify: 'center' });

            const txtV = makeVar('ttxt', ctx);
            const txtColor = isActive ? 'text-primary' : 'text-secondary';
            const txtWeight = isActive ? 600 : 400;
            b.line(`const ${txtV} = makeText(${JSON.stringify(label)}, 14, ${txtWeight}, ${tokenRef(txtColor)}, 1, ${tabW});`);
            b.line(`${txtV}.name = '${node.id}_tab_${i}_label';`);
            emitAppendChild(b, tabV, txtV, 'auto');

            // Active indicator bar
            if (isActive) {
              const indV = makeVar('tind', ctx);
              emitBoard(b, indV, `${node.id}_tab_${i}_indicator`, tabW, 2, borderColor);
              emitAppendChild(b, tabV, indV, 'fill', 'fix');
            }

            emitAppendChild(b, v, tabV, 'auto', 'fill');
          }
        } else {
          // Fallback: render a placeholder tab row from label or title
          const label = node.label ?? node.title ?? 'Tab 1, Tab 2, Tab 3';
          const tabs = label.split(',').map(s => s.trim());
          for (let i = 0; i < tabs.length; i++) {
            const txtV = makeVar('ttxt', ctx);
            const txtColor = i === 0 ? 'text-primary' : 'text-secondary';
            const txtWeight = i === 0 ? 600 : 400;
            b.line(`const ${txtV} = makeText(${JSON.stringify(tabs[i])}, 14, ${txtWeight}, ${tokenRef(txtColor)}, 1, 100);`);
            b.line(`${txtV}.name = '${node.id}_tab_${i}';`);
            emitAppendChild(b, v, txtV, 'auto');
          }
        }

        // Bottom border
        const borderW = source.states.default?.border_width ?? 1;
        emitStroke(b, v, source.states.default?.border ?? 'border-default', borderW);
        break;
      }

      case 'progress-bar': {
        const height = node.height ?? 8;
        const trackH = height;
        const fillColor = node.color ?? source.states.default?.text ?? 'cta-primary';
        const value = typeof node.value === 'number' ? node.value : 60; // default 60%
        const fillWidth = Math.round(width * (value / 100));

        emitBoard(b, v, node.id, width, trackH + 20, 'transparent');
        emitFlex(b, v, 'column', { gap: 4 });

        // Track
        const trackV = makeVar('trk', ctx);
        emitBoard(b, trackV, `${node.id}_track`, width, trackH, bg);
        emitRadius(b, trackV, trackH / 2);
        emitFlex(b, trackV, 'row');

        // Fill
        const fillV = makeVar('fill', ctx);
        emitBoard(b, fillV, `${node.id}_fill`, fillWidth, trackH, fillColor);
        emitRadius(b, fillV, trackH / 2);
        emitAppendChild(b, trackV, fillV, 'fix', 'fill');
        emitAppendChild(b, v, trackV, 'fill', 'fix');

        // Optional label
        if (node.label) {
          const typo = resolveTypography('small', ctx.tokens);
          const lblV = makeVar('plbl', ctx);
          b.line(`const ${lblV} = makeText(${JSON.stringify(node.label)}, ${typo?.fontSize ?? 11}, ${typo?.fontWeight ?? 400}, ${tokenRef('text-secondary')}, 1, ${width});`);
          b.line(`${lblV}.name = '${node.id}_label';`);
          emitAppendChild(b, v, lblV, 'fill');
        }
        break;
      }

      case 'search-input': {
        const height = node.height ?? minHeight;
        const borderColor = source.states.default?.border ?? 'border-default';

        emitBoard(b, v, node.id, width, height, bg);
        emitFlex(b, v, 'row', { align: 'center', gap: 8, px: 12 });
        if (radius > 0) emitRadius(b, v, radius);
        emitStroke(b, v, borderColor, 1);

        // Search icon (magnifying glass unicode)
        const iconV = makeVar('sico', ctx);
        b.line(`const ${iconV} = makeText("🔍", 14, 400, ${tokenRef('text-secondary')}, 0.7, 20);`);
        b.line(`${iconV}.name = '${node.id}_icon';`);
        emitAppendChild(b, v, iconV, 'auto');

        // Placeholder text
        const placeholder = node.placeholder ?? node.label ?? 'Search...';
        const phV = makeVar('sph', ctx);
        b.line(`const ${phV} = makeText(${JSON.stringify(placeholder)}, 14, 400, ${tokenRef('text-secondary')}, 0.5, ${width - 60});`);
        b.line(`${phV}.name = '${node.id}_placeholder';`);
        emitAppendChild(b, v, phV, 'fill');
        break;
      }

      case 'pagination': {
        const height = node.height ?? 36;
        emitBoard(b, v, node.id, width, height, 'transparent');
        emitFlex(b, v, 'row', { align: 'center', justify: 'center', gap: 4 });

        // Prev button
        const prevV = makeVar('pprev', ctx);
        b.line(`const ${prevV} = makeText("←", 14, 500, ${tokenRef('text-secondary')}, 1, 36);`);
        b.line(`${prevV}.name = '${node.id}_prev';`);
        emitAppendChild(b, v, prevV, 'auto');

        // Page numbers (from items or default 1-5)
        const pages = node.items
          ? (node.items as readonly Record<string, unknown>[]).map(i => String(i.label ?? i.page ?? ''))
          : ['1', '2', '3', '4', '5'];
        for (let i = 0; i < pages.length; i++) {
          const pgV = makeVar('pg', ctx);
          const isActive = i === 0;
          const pgBg = isActive ? 'cta-primary' : 'transparent';
          const pgColor = isActive ? 'text-on-cta' : 'text-primary';
          emitBoard(b, pgV, `${node.id}_page_${i}`, 36, 36, pgBg);
          emitFlex(b, pgV, 'row', { align: 'center', justify: 'center' });
          emitRadius(b, pgV, 8);
          const ptV = makeVar('ptxt', ctx);
          b.line(`const ${ptV} = makeText(${JSON.stringify(pages[i])}, 14, 500, ${tokenRef(pgColor)}, 1, 36);`);
          b.line(`${ptV}.name = '${node.id}_page_${i}_text';`);
          emitAppendChild(b, pgV, ptV, 'auto');
          emitAppendChild(b, v, pgV, 'auto', 'fix');
        }

        // Next button
        const nextV = makeVar('pnext', ctx);
        b.line(`const ${nextV} = makeText("→", 14, 500, ${tokenRef('text-secondary')}, 1, 36);`);
        b.line(`${nextV}.name = '${node.id}_next';`);
        emitAppendChild(b, v, nextV, 'auto');
        break;
      }

      case 'input-like': {
        // Same as input-text pattern
        const height = node.height ?? minHeight;
        const borderColor = source.states.default?.border ?? 'border-default';
        const outerHeight = height + 20 + (node.helper ? 20 : 0);

        emitBoard(b, v, node.id, width, outerHeight, 'transparent');
        emitFlex(b, v, 'column', { gap: 4 });

        if (node.label) {
          const labelTypo = resolveTypography('label', ctx.tokens);
          const lv = makeVar('dlbl', ctx);
          b.line(`const ${lv} = makeText(${JSON.stringify(node.label)}, ${labelTypo?.fontSize ?? 12}, ${labelTypo?.fontWeight ?? 500}, ${tokenRef('text-secondary')}, 1, ${width});`);
          b.line(`${lv}.name = '${node.id}_label';`);
          emitAppendChild(b, v, lv, 'fill');
        }

        const bx = makeVar('dbox', ctx);
        emitBoard(b, bx, `${node.id}_box`, width, height, bg);
        emitFlex(b, bx, 'row', { align: 'center', px: 12, gap: 4 });
        if (radius > 0) emitRadius(b, bx, radius);
        emitStroke(b, bx, borderColor, 1);

        const phText = node.placeholder ?? '';
        const phV = makeVar('dph', ctx);
        b.line(`const ${phV} = makeText(${JSON.stringify(phText)}, 14, 400, ${tokenRef('text-primary')}, 0.5, ${width - 24});`);
        b.line(`${phV}.name = '${node.id}_placeholder';`);
        emitAppendChild(b, bx, phV, 'fill');
        emitAppendChild(b, v, bx, 'fill');

        if (node.helper) {
          const hv = makeVar('dhlp', ctx);
          b.line(`const ${hv} = makeText(${JSON.stringify(node.helper)}, 11, 400, ${tokenRef('text-secondary')}, 0.7, ${width});`);
          b.line(`${hv}.name = '${node.id}_helper';`);
          emitAppendChild(b, v, hv, 'fill');
        }
        break;
      }

      case 'container': {
        const height = node.height ?? 100;
        const gap = source.spacing?.internal_gap ? parseInt(source.spacing.internal_gap, 10) : 8;
        emitBoard(b, v, node.id, width, height, bg);
        if (node.layout) {
          emitFlex(b, v, node.layout.dir, {
            align: node.layout.align, justify: node.layout.justify,
            gap: node.layout.gap ?? gap, px: node.layout.px, py: node.layout.py,
          });
        } else {
          emitFlex(b, v, 'column', { gap });
        }
        if (radius > 0) emitRadius(b, v, radius);
        const shadowRef = node.shadow ?? (cat?.shadow as string | undefined);
        if (shadowRef && shadowRef !== 'none') {
          emitShadow(b, v, resolveShadow(shadowRef, ctx.tokens));
        }
        break;
      }

      default: {
        // leaf: simple board with centered label
        const height = node.height ?? minHeight;
        emitBoard(b, v, node.id, width, height, bg);
        emitFlex(b, v, 'row', { align: 'center', justify: 'center' });
        if (radius > 0) emitRadius(b, v, radius);

        const label = node.label ?? node.content ?? '';
        if (label) {
          const typoRole = node.typography ?? (cat?.text_typography as string | undefined) ?? 'body';
          const typo = resolveTypography(typoRole, ctx.tokens);
          const tv = makeVar('dtxt', ctx);
          b.line(`const ${tv} = makeText(${JSON.stringify(label)}, ${typo?.fontSize ?? 14}, ${typo?.fontWeight ?? 400}, ${tokenRef(node.color ?? 'text-primary')}, 1, ${width});`);
          b.line(`${tv}.name = '${node.id}_label';`);
          emitAppendChild(b, v, tv, 'auto');
        }
        break;
      }
    }

    const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
    emitAppendChild(b, parentVar, v, hSizing, 'auto');
    emitPluginData(b, v, node);
    ctx.trackNode(v, node.id);
    b.blank();
    return v;
  };
}

/**
 * Generate a CatalogEntry from a DynamicCatalogSource.
 * Mirrors what loadCatalogForRenderer's transformEntry does.
 */
export function generateCatalogEntry(source: DynamicCatalogSource): CatalogEntry {
  const entry: Record<string, unknown> = {};

  if (source.states.default) {
    entry.background = source.states.default.bg;
    entry.text_color = source.states.default.text;
    if (source.states.default.border) entry.border_color = source.states.default.border;
    if (source.states.default.border_width) entry.border_width = source.states.default.border_width;
  }

  if (source.token_bindings) {
    if (source.token_bindings['border-radius'] !== undefined) entry.radius = source.token_bindings['border-radius'];
    if (source.token_bindings['padding-x'] !== undefined) entry.padding_x = source.token_bindings['padding-x'];
    if (source.token_bindings['padding-y'] !== undefined) entry.padding_y = source.token_bindings['padding-y'];
    if (source.token_bindings.font !== undefined) entry.text_typography = source.token_bindings.font;
    if (source.token_bindings.text !== undefined) entry.text_color = source.token_bindings.text;
    if (source.token_bindings.background !== undefined) entry.background = source.token_bindings.background;
  }

  if (source.spacing?.internal_gap) {
    const gap = parseInt(source.spacing.internal_gap, 10);
    if (!isNaN(gap)) entry.gap = gap;
  }

  if (source.min_height !== undefined) entry.min_height = source.min_height;

  return entry as CatalogEntry;
}
