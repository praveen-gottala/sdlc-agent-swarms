import { renderToScript } from '../index.js';
import { SAMPLE_TOKENS } from '../../../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../../../__fixtures__/catalog-entries.js';
import type { DesignSpecV2 } from '../../../types/design-spec-v2.js';

/** Minimal spec with one data-table node. */
const TABLE_SPEC: DesignSpecV2 = {
  screen: 'test-table',
  width: 800,
  nodes: {
    root: {
      parent: null,
      order: 0,
      type: 'page',
      label: 'Table Test',
    },
    dataTable: {
      parent: 'root',
      order: 0,
      catalog: 'data-table',
      label: 'Orders',
      items: [
        { Name: 'Alice', Amount: '$42', Status: 'Paid' },
        { Name: 'Bob', Amount: '$18', Status: 'Pending' },
      ],
    },
  },
};

describe('renderDataTable', () => {
  const result = renderToScript(TABLE_SPEC, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  it('produces a non-empty script', () => {
    expect(result.script.length).toBeGreaterThan(0);
  });

  it('script is parseable by new Function()', () => {
    expect(() => new Function('penpot', result.script)).not.toThrow();
  });

  it('contains a createBoard for the table container', () => {
    expect(result.script).toContain("// DataTable: dataTable");
  });

  it('renders header cells with column names from items keys', () => {
    expect(result.script).toContain('"Name"');
    expect(result.script).toContain('"Amount"');
    expect(result.script).toContain('"Status"');
  });

  it('renders body rows with actual item values', () => {
    expect(result.script).toContain('"Alice"');
    expect(result.script).toContain('"$42"');
    expect(result.script).toContain('"Pending"');
  });

  it('renders row dividers between body rows', () => {
    // One divider between 2 rows
    expect(result.script).toContain('dataTable_sep_0');
  });

  it('does not use createRectangle or createEllipse', () => {
    expect(result.script).not.toContain('createRectangle');
    expect(result.script).not.toContain('createEllipse');
  });

  it('uses stroke for table border', () => {
    expect(result.script).toContain('strokeColor');
    expect(result.script).toContain("strokeAlignment: 'inner'");
  });

  it('tracks the table node in nodeIds', () => {
    expect(result.nodeIds).toContain('dataTable');
  });

  it('emits setPluginData for the table', () => {
    expect(result.script).toContain("setPluginData('ds_id', 'dataTable')");
  });
});

describe('renderDataTable — no items (fallback)', () => {
  const specNoItems: DesignSpecV2 = {
    screen: 'test-empty-table',
    width: 600,
    nodes: {
      root: { parent: null, order: 0, type: 'page', label: 'Empty' },
      emptyTable: { parent: 'root', order: 0, catalog: 'data-table', label: 'Data' },
    },
  };

  const result = renderToScript(specNoItems, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  it('renders default columns when no items are provided', () => {
    expect(result.script).toContain('"Column 1"');
    expect(result.script).toContain('"Column 2"');
    expect(result.script).toContain('"Column 3"');
  });

  it('renders 3 default placeholder rows', () => {
    expect(result.script).toContain('emptyTable_row_0');
    expect(result.script).toContain('emptyTable_row_1');
    expect(result.script).toContain('emptyTable_row_2');
  });
});
