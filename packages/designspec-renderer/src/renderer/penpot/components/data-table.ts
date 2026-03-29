/**
 * @module @agentforge/designspec-renderer/renderer/penpot/components/data-table
 * Renderer for the `data-table` catalog component — tabular data with header
 * row, body rows, and optional dividers between rows.
 *
 * Children added by the tree walker are appended after the table body
 * (e.g., pagination or footer controls).
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

/** Default number of placeholder body rows when no items are provided. */
const DEFAULT_ROW_COUNT = 3;

/** Default columns when no items or column headers are provided. */
const DEFAULT_COLUMNS = ['Column 1', 'Column 2', 'Column 3'];

/** Render a data table with header row and body rows. */
export const renderDataTable: ComponentRenderer = (node, parentVar, ctx) => {
  const v = makeVar('tbl', ctx);
  const b = ctx.builder;
  const cat = node.catalogEntry;

  const width =
    typeof node.width === 'number' ? node.width : ctx.effectiveWidth;
  const radius = node.radius ?? (cat?.radius as number | undefined) ?? 8;
  const bg =
    node.background ?? (cat?.background as string | undefined) ?? 'surface-primary';
  const pad = node.padding ?? (cat?.padding as number | undefined) ?? 0;

  // Typography
  const headerTypo = resolveTypography('label', ctx.tokens);
  const headerSize = headerTypo?.fontSize ?? 12;
  const headerWeight = headerTypo?.fontWeight ?? 600;
  const bodyTypo = resolveTypography('body', ctx.tokens);
  const bodySize = bodyTypo?.fontSize ?? 14;
  const bodyWeight = bodyTypo?.fontWeight ?? 400;

  // Determine columns from items keys or fallback
  const items = node.items;
  const columns: string[] =
    items && items.length > 0
      ? Object.keys(items[0])
      : DEFAULT_COLUMNS;

  const rowCount =
    items && items.length > 0 ? items.length : DEFAULT_ROW_COUNT;
  const rowHeight = 44;
  const headerHeight = 40;
  const tableHeight = headerHeight + rowCount * rowHeight + pad * 2;

  b.comment(`DataTable: ${node.id}`);

  // Table container
  emitBoard(b, v, node.id, width, tableHeight, bg);
  emitFlex(b, v, 'column', { gap: 0, px: pad, py: pad });
  emitRadius(b, v, radius);

  // Border
  const borderColor =
    node.border_color ?? (cat?.border_color as string | undefined) ?? 'border-default';
  emitStroke(b, v, borderColor, 1);

  // ── Header row ──
  const hRow = makeVar('thr', ctx);
  emitBoard(b, hRow, `${node.id}_header`, width, headerHeight, 'surface-secondary');
  emitFlex(b, hRow, 'row', { gap: 0, px: 12, py: 0 });
  b.line(`${hRow}.flex.alignItems = 'center';`);

  for (const col of columns) {
    const hCell = makeVar('thc', ctx);
    b.line(
      `const ${hCell} = makeText(${JSON.stringify(col)}, ${headerSize}, ${headerWeight}, ${tokenRef('text-secondary')}, 1, ${Math.floor(width / columns.length)});`,
    );
    b.line(`${hCell}.name = '${node.id}_h_${col.replace(/\s+/g, '_')}';`);
    emitAppendChild(b, hRow, hCell, 'fill');
  }

  emitAppendChild(b, v, hRow, 'fill', 'fix');

  // ── Body rows ──
  for (let r = 0; r < rowCount; r++) {
    const row = makeVar('tdr', ctx);
    emitBoard(b, row, `${node.id}_row_${r}`, width, rowHeight, 'transparent');
    emitFlex(b, row, 'row', { gap: 0, px: 12, py: 0 });
    b.line(`${row}.flex.alignItems = 'center';`);

    for (const col of columns) {
      const cellVal =
        items && items[r] ? String(items[r][col] ?? '') : `Row ${r + 1}`;
      const cell = makeVar('tdc', ctx);
      b.line(
        `const ${cell} = makeText(${JSON.stringify(cellVal)}, ${bodySize}, ${bodyWeight}, ${tokenRef('text-primary')}, 1, ${Math.floor(width / columns.length)});`,
      );
      b.line(`${cell}.name = '${node.id}_r${r}_${col.replace(/\s+/g, '_')}';`);
      emitAppendChild(b, row, cell, 'fill');
    }

    emitAppendChild(b, v, row, 'fill', 'fix');

    // Divider between rows (except after last)
    if (r < rowCount - 1) {
      const div = makeVar('tds', ctx);
      emitBoard(b, div, `${node.id}_sep_${r}`, width, 1, 'border-default');
      b.line(`${div}.fills = [{ fillColor: ${tokenRef('border-default')}, fillOpacity: 0.3 }];`);
      emitAppendChild(b, v, div, 'fill', 'fix');
    }
  }

  const hSizing = node.width === 'fill' || node.width === undefined ? 'fill' : 'fix';
  emitAppendChild(b, parentVar, v, hSizing, 'auto');
  emitPluginData(b, v, node);
  ctx.trackNode(v, node.id);
  b.blank();
  return v;
};
