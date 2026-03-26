/**
 * @module pipeline-integration.test
 * Phase 3: Pipeline integration tests.
 *
 * Tests stage-to-stage data flow across the renderer pipeline:
 *   loadCatalogForRenderer → validateDesignSpec → buildTree → buildTokenMap → renderToScript
 *
 * Every test imports ONLY from the public barrel (./index.ts).
 * Generic fixtures — no app-specific names.
 */
import {
  renderToScript,
  loadCatalogForRenderer,
  validateDesignSpec,
} from './index.js';
import type { DesignSpecV2 } from './index.js';
import { SAMPLE_TOKENS } from './__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from './__fixtures__/catalog-entries.js';
import { loadFixture } from './__fixtures__/load-fixture.js';
import type { CatalogMap, RendererTokens } from './index.js';

/* ================================================================== */
/*  Inline fixtures                                                    */
/* ================================================================== */

/** 1 node — root page only. */
const MINIMAL_SPEC: DesignSpecV2 = {
  screen: 'minimal',
  width: 1440,
  nodes: {
    root: {
      parent: null,
      order: 0,
      type: 'page',
      background: 'background-primary',
      layout: { dir: 'column', align: 'center' },
    },
  },
};

/** 6-level deep nesting. */
const DEEP_NEST_SPEC: DesignSpecV2 = {
  screen: 'deep-nest',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
    sec: { parent: 'root', order: 0, type: 'section', title: 'Level 1', layout: { dir: 'column' } },
    ctr1: { parent: 'sec', order: 0, type: 'container', layout: { dir: 'column' } },
    ctr2: { parent: 'ctr1', order: 0, type: 'container', layout: { dir: 'column' } },
    ctr3: { parent: 'ctr2', order: 0, type: 'container', layout: { dir: 'row' } },
    leaf: { parent: 'ctr3', order: 0, type: 'text', content: 'Leaf Node', typography: 'body', color: 'text-primary' },
  },
};

/** One node per catalog entry + root = 16 nodes. */
const ALL_CATALOG_SPEC: DesignSpecV2 = {
  screen: 'all-catalog',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column', gap: 16 } },
    n01: { parent: 'root', order: 0, catalog: 'input-text', label: 'Name', placeholder: 'Enter name' },
    n02: { parent: 'root', order: 1, catalog: 'input-currency', label: 'Amount', placeholder: '0.00' },
    n03: { parent: 'root', order: 2, catalog: 'button-primary', label: 'Submit' },
    n04: { parent: 'root', order: 3, catalog: 'button-secondary', label: 'Cancel' },
    n05: { parent: 'root', order: 4, catalog: 'button-ghost', label: 'Skip' },
    n06: { parent: 'root', order: 5, catalog: 'segmented-control', options: [{ label: 'A', selected: true }, { label: 'B', selected: false }] },
    n07: { parent: 'root', order: 6, catalog: 'stepper', label: 'Quantity', value: 1 },
    n08: { parent: 'root', order: 7, catalog: 'select', label: 'Country', placeholder: 'Choose' },
    n09: { parent: 'root', order: 8, catalog: 'display-readonly', label: 'Status', value: 'Active' },
    n10: { parent: 'root', order: 9, catalog: 'checkbox', label: 'Agree to terms' },
    n11: { parent: 'root', order: 10, catalog: 'badge', label: 'New' },
    n12: { parent: 'root', order: 11, catalog: 'stat', label: 'Revenue', value: '$12,345' },
    n13: { parent: 'root', order: 12, catalog: 'card' },
    n14: { parent: 'root', order: 13, catalog: 'avatar', label: 'JD' },
    n15: { parent: 'root', order: 14, catalog: 'tooltip', label: 'Hint text' },
  },
};

/* ================================================================== */
/*  Real JSON fixtures                                                 */
/* ================================================================== */

const { spec: settingsForm } = loadFixture('settings-form');
const { spec: dashboardDetail } = loadFixture('dashboard-detail');

/* ================================================================== */
/*  Group 1: Stage-to-stage data flow                                  */
/* ================================================================== */
describe('Pipeline data flow', () => {
  it('1.1 — modified token hex flows into rendered script token map', () => {
    // Mutate deep-teal primitive to a bright red
    const modifiedTokens: RendererTokens = {
      ...SAMPLE_TOKENS,
      colors: {
        ...SAMPLE_TOKENS.colors,
        primitive: {
          ...SAMPLE_TOKENS.colors.primitive,
          'deep-teal': '#FF0000',
        },
      },
    };

    const result = renderToScript(settingsForm, modifiedTokens, V2_BUILTIN_CATALOG);

    // Token map should contain the mutated hex, not the original
    expect(result.script).toContain('#FF0000');
    expect(result.script).not.toContain('#0F6E56');
  });

  it('1.2 — catalog defaults flow through resolveNode to renderer output', () => {
    const customCatalog: CatalogMap = {
      ...V2_BUILTIN_CATALOG,
      'button-primary': {
        ...V2_BUILTIN_CATALOG['button-primary'],
        height: 99,
        radius: 42,
      },
    };

    const spec: DesignSpecV2 = {
      screen: 'catalog-flow-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        btn: { parent: 'root', order: 0, catalog: 'button-primary', label: 'Click' },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, customCatalog);

    // Height 99 should appear in a resize() call
    expect(result.script).toMatch(/resize\(\s*\d+,\s*99\s*\)/);
    // Radius 42 should appear in borderRadius assignment
    expect(result.script).toContain('borderRadius = 42');
  });

  it('1.3 — node overrides beat catalog defaults', () => {
    const customCatalog: CatalogMap = {
      ...V2_BUILTIN_CATALOG,
      'button-primary': {
        ...V2_BUILTIN_CATALOG['button-primary'],
        height: 99,
      },
    };

    const spec: DesignSpecV2 = {
      screen: 'override-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        btn: { parent: 'root', order: 0, catalog: 'button-primary', label: 'Click', overrides: { height: 77 } },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, customCatalog);

    // Override height 77 should win over catalog height 99
    expect(result.script).toMatch(/resize\(\s*\d+,\s*77\s*\)/);
    expect(result.script).not.toMatch(/resize\(\s*\d+,\s*99\s*\)/);
  });

  it('1.4 — tree ordering controls render sequence', () => {
    const spec: DesignSpecV2 = {
      screen: 'order-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        third: { parent: 'root', order: 2, type: 'text', content: 'Third', typography: 'body', color: 'text-primary' },
        first: { parent: 'root', order: 0, type: 'text', content: 'First', typography: 'body', color: 'text-primary' },
        second: { parent: 'root', order: 1, type: 'text', content: 'Second', typography: 'body', color: 'text-primary' },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    // Extract ds_id plugin data calls — order should be root, first, second, third
    const dsIdPattern = /setPluginData\('ds_id', '(\w+)'\)/g;
    const renderOrder: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = dsIdPattern.exec(result.script)) !== null) {
      renderOrder.push(match[1]);
    }

    expect(renderOrder).toEqual(['root', 'first', 'second', 'third']);
  });

  it('1.5 — loadCatalogForRenderer output produces identical render to V2_BUILTIN_CATALOG', () => {
    const loadedCatalog = loadCatalogForRenderer();

    const resultLoaded = renderToScript(settingsForm, SAMPLE_TOKENS, loadedCatalog);
    const resultDirect = renderToScript(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(resultLoaded.script).toBe(resultDirect.script);
    expect(resultLoaded.nodeIds).toEqual(resultDirect.nodeIds);
    expect(resultLoaded.warnings).toEqual(resultDirect.warnings);
  });

  it('1.6 — catalog extends chain flows to rendered output (input-currency inherits input-text border)', () => {
    const spec: DesignSpecV2 = {
      screen: 'extends-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        curr: { parent: 'root', order: 0, catalog: 'input-currency', label: 'Amount', placeholder: '0.00' },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    // input-currency extends input-text which has border_color: 'border-default'
    // 'border-default' resolves to 'warm-gray-light' -> '#9C9C97'
    // This should appear as a stroke via the token ref T.borderDefault
    expect(result.script).toContain('T.borderDefault');
    // And should render successfully with 2 nodeIds
    expect(result.nodeIds).toContain('curr');
    expect(result.warnings).toEqual([]);
  });
});

/* ================================================================== */
/*  Group 2: Edge cases                                                */
/* ================================================================== */
describe('Edge cases', () => {
  it('2.1 — minimal spec (root only) renders successfully', () => {
    const result = renderToScript(MINIMAL_SPEC, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(result.script.length).toBeGreaterThan(0);
    expect(result.nodeIds).toEqual(['root']);
    expect(result.warnings).toEqual([]);
    expect(() => new Function('penpot', result.script)).not.toThrow();
  });

  it('2.2 — root + single text child produces 2 nodeIds with makeText', () => {
    const spec: DesignSpecV2 = {
      screen: 'single-text',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        txt: { parent: 'root', order: 0, type: 'text', content: 'Hello', typography: 'body', color: 'text-primary' },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(result.nodeIds).toHaveLength(2);
    expect(result.nodeIds).toContain('root');
    expect(result.nodeIds).toContain('txt');
    expect(result.script).toContain('makeText(');
  });

  it('2.3 — deep nesting (6 levels) renders all nodes', () => {
    const result = renderToScript(DEEP_NEST_SPEC, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(result.nodeIds).toHaveLength(6);
    expect(result.warnings).toEqual([]);

    // Should have at least 5 appendChild calls (root doesn't get appended)
    const appendCalls = result.script.match(/\.appendChild\(/g);
    expect(appendCalls).not.toBeNull();
    expect(appendCalls!.length).toBeGreaterThanOrEqual(5);
  });

  it('2.4 — all 15 catalog entries render with correct ds_catalog metadata', () => {
    const result = renderToScript(ALL_CATALOG_SPEC, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    // 15 catalog nodes + 1 root = 16
    expect(result.nodeIds).toHaveLength(16);

    // Each catalog entry should have its ds_catalog tagged
    const expectedCatalogs = [
      'input-text', 'input-currency', 'button-primary', 'button-secondary',
      'button-ghost', 'segmented-control', 'stepper', 'select',
      'display-readonly', 'checkbox', 'badge', 'stat', 'card', 'avatar', 'tooltip',
    ];
    for (const cat of expectedCatalogs) {
      expect(result.script).toContain(`setPluginData('ds_catalog', '${cat}')`);
    }

    // No warnings — all catalog entries are valid
    expect(result.warnings).toEqual([]);
  });
});

/* ================================================================== */
/*  Group 3: Determinism                                               */
/* ================================================================== */
describe('Determinism', () => {
  it('3.1 — settings-form renders identically on repeated calls', () => {
    const r1 = renderToScript(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    const r2 = renderToScript(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(r1.script).toBe(r2.script);
    expect([...r1.nodeIds]).toEqual([...r2.nodeIds]);
  });

  it('3.2 — dashboard-detail (72 nodes) renders identically on repeated calls', () => {
    const r1 = renderToScript(dashboardDetail, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    const r2 = renderToScript(dashboardDetail, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(r1.script).toBe(r2.script);
    expect([...r1.nodeIds]).toEqual([...r2.nodeIds]);
  });
});

/* ================================================================== */
/*  Group 4: Full pipeline walkthrough                                 */
/* ================================================================== */
describe('Full pipeline walkthrough', () => {
  it('4.1 — validate → render (clean settings-form)', () => {
    const validation = validateDesignSpec(settingsForm, V2_BUILTIN_CATALOG);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    const result = renderToScript(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.warnings).toEqual([]);
    expect(result.nodeIds.length).toBe(Object.keys(settingsForm.nodes).length);
  });

  it('4.2 — validate → render (spec with warnings-only issues)', () => {
    // A node with BOTH type and catalog triggers a warning (rule 5)
    // Order gap [0, 2] triggers a warning (rule 7)
    const spec: DesignSpecV2 = {
      screen: 'warning-spec',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        dual: { parent: 'root', order: 0, type: 'container', catalog: 'card' },
        child: { parent: 'root', order: 2, type: 'text', content: 'Gap', typography: 'body', color: 'text-primary' },
      },
    };

    const validation = validateDesignSpec(spec, V2_BUILTIN_CATALOG);
    // Should be valid (no errors) but have warnings
    expect(validation.valid).toBe(true);
    expect(validation.warnings.length).toBeGreaterThan(0);

    // Should still render successfully
    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.script.length).toBeGreaterThan(0);
    expect(result.nodeIds).toContain('root');
    expect(result.nodeIds).toContain('dual');
    expect(result.nodeIds).toContain('child');
  });

  it('4.3 — validate catches invalid catalog; render falls back to container', () => {
    const spec: DesignSpecV2 = {
      screen: 'invalid-catalog',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        bad: { parent: 'root', order: 0, catalog: 'nonexistent-widget', label: 'Broken' },
      },
    };

    // Validation catches the error
    const validation = validateDesignSpec(spec, V2_BUILTIN_CATALOG);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.rule === 'valid-catalog')).toBe(true);

    // Renderer gracefully degrades — renders with warning, falls back to container
    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.script.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.join(' ')).toContain('nonexistent-widget');
    expect(result.nodeIds).toContain('bad');
  });

  it('4.4 — loadCatalogForRenderer → validateDesignSpec → renderToScript full chain', () => {
    // Load catalog (built-ins only — no raw spec)
    const catalog = loadCatalogForRenderer();

    // Create a spec referencing a built-in catalog entry
    const spec: DesignSpecV2 = {
      screen: 'full-chain',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        myCard: { parent: 'root', order: 0, catalog: 'card' },
        myBadge: { parent: 'root', order: 1, catalog: 'badge', label: 'OK' },
      },
    };

    // Stage 1: Validate
    const validation = validateDesignSpec(spec, catalog);
    expect(validation.valid).toBe(true);

    // Stage 2: Render
    const result = renderToScript(spec, SAMPLE_TOKENS, catalog);
    expect(result.warnings).toEqual([]);
    expect(result.nodeIds).toContain('myCard');
    expect(result.nodeIds).toContain('myBadge');
    expect(result.script).toContain("setPluginData('ds_catalog', 'card')");
    expect(result.script).toContain("setPluginData('ds_catalog', 'badge')");
  });
});

/* ================================================================== */
/*  Group 5: Boundary / regression guards                              */
/* ================================================================== */
describe('Boundary / regression', () => {
  it('5.1 — node with neither type nor catalog: validate errors, render skips with warning', () => {
    const spec: DesignSpecV2 = {
      screen: 'no-type-no-catalog',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        orphan: { parent: 'root', order: 0, label: 'Lost' } as DesignSpecV2['nodes'][string],
      },
    };

    // Validation catches it
    const validation = validateDesignSpec(spec, V2_BUILTIN_CATALOG);
    expect(validation.valid).toBe(false);
    expect(validation.errors.some(e => e.rule === 'type-xor-catalog' && e.nodeId === 'orphan')).toBe(true);

    // Renderer skips the node with a warning
    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.join(' ')).toMatch(/orphan/);
    // Root still renders, orphan is skipped
    expect(result.nodeIds).toContain('root');
    expect(result.nodeIds).not.toContain('orphan');
  });

  it('5.2 — extends chain (input-currency → input-text) renders inherited border settings', () => {
    const spec: DesignSpecV2 = {
      screen: 'extends-chain',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        curr: { parent: 'root', order: 0, catalog: 'input-currency', label: 'Price', placeholder: '0.00' },
      },
    };

    const result = renderToScript(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    // input-text defines border_width: 1 and radius: 12
    // input-currency extends input-text, so these should be inherited
    expect(result.script).toContain('borderRadius = 12');
    // border_color = 'border-default' → T.borderDefault in the script
    expect(result.script).toContain('T.borderDefault');

    // Should also show the currency prefix '$'
    expect(result.script).toContain('$');

    expect(result.nodeIds).toContain('curr');
    expect(result.warnings).toEqual([]);
  });
});
