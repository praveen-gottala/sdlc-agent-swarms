/**
 * @module render-to-jsx.test
 * Integration tests for the React/JSX renderer.
 * Mirrors the Penpot render-to-script.test.ts structure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToJSX } from './index.js';
import { SAMPLE_TOKENS } from '../../__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../../__fixtures__/catalog-entries.js';
import type { DesignSpecV2 } from '../../types/design-spec-v2.js';

const settingsForm: DesignSpecV2 = JSON.parse(
  readFileSync(join(__dirname, '../../../__tests__/fixtures/settings-form.json'), 'utf-8'),
);

const dashboardDetail: DesignSpecV2 = JSON.parse(
  readFileSync(join(__dirname, '../../../__tests__/fixtures/dashboard-detail.json'), 'utf-8'),
);

/* ------------------------------------------------------------------ */
/*  Settings-form integration tests (21 nodes)                        */
/* ------------------------------------------------------------------ */
describe('renderToJSX — settings-form', () => {
  const result = renderToJSX(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  // 1. Output is non-empty string
  it('produces a non-empty JSX string', () => {
    expect(typeof result.jsx).toBe('string');
    expect(result.jsx.length).toBeGreaterThan(0);
  });

  // 2. Contains correct component name
  it('contains the correct PascalCase component name', () => {
    expect(result.jsx).toContain('export function SettingsFormScreen()');
  });

  // 3. Contains shadcn imports
  it('contains shadcn import statements', () => {
    expect(result.jsx).toContain("import { Button } from '@/components/ui/button'");
    expect(result.jsx).toContain("import { Input } from '@/components/ui/input'");
  });

  // 4. Uses CSS variable references, not raw hex
  it('uses CSS variable references for colors, not raw hex', () => {
    // Should contain var(--...) references
    expect(result.jsx).toContain('var(--background-primary)');
    expect(result.jsx).toContain('var(--cta-primary)');

    // Should NOT contain raw hex colors from the token set
    // (Hex values should only exist if they're NOT from the color system)
    const afterImports = result.jsx.slice(result.jsx.indexOf('return'));
    expect(afterImports).not.toMatch(/#0F6E56/); // deep-teal hex
    expect(afterImports).not.toMatch(/#FFF8E7/); // warm-cream hex
  });

  // 5. Contains semantic HTML tags
  it('contains semantic HTML tags', () => {
    expect(result.jsx).toContain('<header');
    expect(result.jsx).toContain('<section');
    expect(result.jsx).toContain('<hr');
  });

  // 6. Logo text uses correct typography
  it('renders logo text with heading-3 typography classes', () => {
    // heading-3 = 18px, weight 600 = font-semibold
    expect(result.jsx).toMatch(/text-\[18px\].*font-semibold/);
    // With cta-primary color as CSS var
    expect(result.jsx).toContain('var(--cta-primary)');
  });

  // 7. Contains button variant attributes
  it('renders button-primary with variant="default"', () => {
    expect(result.jsx).toContain('variant="default"');
  });

  // 8. All 21 node IDs from fixture are in nodeIds
  it('includes all node IDs from the fixture in result.nodeIds', () => {
    const fixtureNodeIds = Object.keys(settingsForm.nodes);
    expect(result.nodeIds.length).toBe(fixtureNodeIds.length);
    for (const id of fixtureNodeIds) {
      expect(result.nodeIds).toContain(id);
    }
  });

  // 9. No warnings for valid input
  it('produces no warnings for a valid settings-form fixture', () => {
    expect(result.warnings).toEqual([]);
  });

  // 10. Segmented control renders tabs
  it('renders segmented-control with shadcn Tabs imports', () => {
    expect(result.jsx).toContain("import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'");
    expect(result.jsx).toContain('Light');
    expect(result.jsx).toContain('Dark');
    expect(result.jsx).toContain('System');
  });

  // 11. Input with label + placeholder
  it('renders input-text with label and placeholder', () => {
    expect(result.jsx).toContain('Display Name');
    expect(result.jsx).toContain('placeholder="Enter your name"');
  });

  // 12. Import deduplication
  it('deduplicates imports — Button imported only once', () => {
    const buttonImports = result.jsx.match(/import.*Button.*from/g);
    expect(buttonImports).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Dashboard-detail scale test (72 nodes)                            */
/* ------------------------------------------------------------------ */
describe('renderToJSX — dashboard-detail', () => {
  const result = renderToJSX(dashboardDetail, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

  // 13. Renderer completes without errors
  it('completes rendering without throwing', () => {
    expect(result.jsx).toBeDefined();
    expect(typeof result.jsx).toBe('string');
    expect(result.jsx.length).toBeGreaterThan(0);
  });

  // 14. All 72 nodes rendered
  it('renders all 72 nodes', () => {
    expect(result.nodeIds.length).toBe(72);
  });

  // 15. Multiple button variants present
  it('renders all button variants', () => {
    expect(result.jsx).toContain('variant="default"');  // button-primary
    expect(result.jsx).toContain('variant="outline"');  // button-secondary
    expect(result.jsx).toContain('variant="ghost"');    // button-ghost
  });

  // 16. Badge renders with label
  it('renders badge with label', () => {
    expect(result.jsx).toContain("import { Badge } from '@/components/ui/badge'");
    expect(result.jsx).toContain('Active');
  });

  // 17. Card renders with children
  it('renders cards', () => {
    expect(result.jsx).toContain("import { Card } from '@/components/ui/card'");
  });
});

/* ------------------------------------------------------------------ */
/*  Determinism                                                        */
/* ------------------------------------------------------------------ */
describe('renderToJSX — determinism', () => {
  // 18. Same input produces identical output
  it('produces identical output on repeated calls', () => {
    const r1 = renderToJSX(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);
    const r2 = renderToJSX(settingsForm, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(r1.jsx).toBe(r2.jsx);
    expect([...r1.nodeIds]).toEqual([...r2.nodeIds]);
  });
});

/* ------------------------------------------------------------------ */
/*  Error handling                                                     */
/* ------------------------------------------------------------------ */
describe('renderToJSX — error handling', () => {
  // 19. Unknown catalog produces warning, falls back to container div
  it('produces a warning and falls back to div for unknown catalog entries', () => {
    const spec: DesignSpecV2 = {
      screen: 'test-unknown',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        bad: { parent: 'root', order: 0, catalog: 'nonexistent-widget', label: 'Mystery' },
      },
    };

    const result = renderToJSX(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(result.jsx.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.join(' ')).toContain('nonexistent-widget');
    expect(result.nodeIds).toContain('bad');
  });

  // 20. Node ordering is correct
  it('renders nodes in correct sibling order', () => {
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

    const result = renderToJSX(spec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    const firstIdx = result.jsx.indexOf('First');
    const secondIdx = result.jsx.indexOf('Second');
    const thirdIdx = result.jsx.indexOf('Third');

    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});
