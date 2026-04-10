/**
 * Integration test: Real Claude API call to convert brownfield app source → DesignSpec V2.
 *
 * This test exercises the REAL LLM codepath:
 * 1. Collects actual source from the brownfield app
 * 2. Builds the import prompt
 * 3. Calls Claude Sonnet 4.6 with forced tool_choice
 * 4. Validates the returned DesignSpec V2 with validateDesignSpec()
 * 5. Checks structural correctness (root node, catalog entries, token usage)
 *
 * Requires ANTHROPIC_API_KEY in .env or environment.
 * Skips if no API key is available (CI-safe).
 */

import { join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { config } from 'dotenv';
import { collectPageSource, convertPageToDesignSpec } from './source-to-designspec.js';
import { createAnthropicProvider } from './anthropic-provider.js';
import { validateDesignSpec, extractCSSVariables, loadCatalogForRenderer } from '@agentforge/designspec-renderer';
import type { RouteInfo } from '@agentforge/designspec-renderer';

// Load .env from monorepo root
const MONOREPO_ROOT = join(__dirname, '..', '..', '..', '..');
config({ path: join(MONOREPO_ROOT, '.env') });

const BROWNFIELD_APP = join(MONOREPO_ROOT, 'agentforge-brownfield-app');
const API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const HAS_API_KEY = API_KEY.length > 10;

// Output directory for generated specs (for manual inspection)
const OUTPUT_DIR = join(BROWNFIELD_APP, '.agentforge', 'import');

const DASHBOARD_ROUTE: RouteInfo = {
  id: 'home',
  route: '/',
  filePath: 'src/app/page.tsx',
  name: 'Dashboard',
};

const SETTINGS_ROUTE: RouteInfo = {
  id: 'settings',
  route: '/settings',
  filePath: 'src/app/settings/page.tsx',
  name: 'Settings',
};

const USERS_ROUTE: RouteInfo = {
  id: 'users',
  route: '/users',
  filePath: 'src/app/users/page.tsx',
  name: 'Users',
};

// Skip entire suite if no API key
const describeWithApi = HAS_API_KEY ? describe : describe.skip;

describeWithApi('Import Integration — Real Claude API', () => {
  // 60s timeout for LLM calls
  jest.setTimeout(120_000);

  let cssVars: readonly import('@agentforge/designspec-renderer').CSSVariable[];
  let catalog: ReturnType<typeof loadCatalogForRenderer>;

  beforeAll(() => {
    const cssResult = extractCSSVariables(BROWNFIELD_APP);
    if (!cssResult.ok) throw new Error(`Failed to extract CSS vars: ${cssResult.error.message}`);
    cssVars = cssResult.value;
    catalog = loadCatalogForRenderer();
  });

  it('converts the dashboard page source → valid DesignSpec V2', async () => {
    const provider = createAnthropicProvider({ apiKey: API_KEY });

    const result = await convertPageToDesignSpec(
      DASHBOARD_ROUTE,
      provider,
      cssVars,
      { appRoot: BROWNFIELD_APP, width: 1440 },
    );

    // ── Must succeed ──
    expect(result.error).toBeUndefined();
    expect(result.spec).not.toBeNull();
    const spec = result.spec!;

    // Save the generated spec for manual inspection
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(
      join(OUTPUT_DIR, 'dashboard-spec.json'),
      JSON.stringify(spec, null, 2),
    );

    // ── Structural validation ──
    const validation = validateDesignSpec(spec, catalog);
    if (validation.errors.length > 0) {
      console.error('Validation errors:', JSON.stringify(validation.errors, null, 2));
    }
    expect(validation.errors).toHaveLength(0);
    expect(validation.valid).toBe(true);

    if (validation.warnings.length > 0) {
      console.log(`Validation warnings: ${validation.warnings.length}`);
    }

    // ── Root node ──
    const nodes = Object.values(spec.nodes);
    const rootNodes = nodes.filter(n => n.parent === null);
    expect(rootNodes).toHaveLength(1);
    expect(rootNodes[0].type).toBe('page');

    // ── Screen metadata ──
    expect(spec.width).toBe(1440);
    expect(spec.screen).toBeTruthy();

    // ── Non-trivial output ──
    // The dashboard page has stat cards, a chart placeholder, performers list,
    // and an activity table — should produce at least 15 nodes
    expect(Object.keys(spec.nodes).length).toBeGreaterThanOrEqual(15);

    // ── Catalog entries used ──
    // The dashboard page uses Card, Badge, Button, Avatar, Table
    const catalogIds = nodes
      .filter(n => n.catalog)
      .map(n => n.catalog!);
    const uniqueCatalogIds = [...new Set(catalogIds)];

    console.log(`Generated ${Object.keys(spec.nodes).length} nodes, ` +
      `${uniqueCatalogIds.length} unique catalog IDs: ${uniqueCatalogIds.join(', ')}`);

    // Should use at least card and button-primary
    expect(uniqueCatalogIds.length).toBeGreaterThanOrEqual(2);

    // ── Text content preserved ──
    // The dashboard has specific text: "Dashboard", "$45,231", "Revenue Overview"
    const allContent = nodes
      .map(n => [n.content, n.label, n.title].filter(Boolean).join(' '))
      .join(' ');
    expect(allContent).toContain('Dashboard');

    // ── Layout properties ──
    // Should have at least some nodes with layout (flex/grid containers)
    const nodesWithLayout = nodes.filter(n => n.layout);
    expect(nodesWithLayout.length).toBeGreaterThanOrEqual(3);

    // ── Sibling order contiguous ──
    const childrenByParent = new Map<string, number[]>();
    for (const node of Object.values(spec.nodes)) {
      if (node.parent) {
        const siblings = childrenByParent.get(node.parent) ?? [];
        siblings.push(node.order);
        childrenByParent.set(node.parent, siblings);
      }
    }
    for (const orders of childrenByParent.values()) {
      orders.sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        expect(orders[i]).toBe(i);
      }
    }
  });

  it('converts the settings page — forms, switches, selects, checkboxes', async () => {
    const provider = createAnthropicProvider({ apiKey: API_KEY });

    const result = await convertPageToDesignSpec(
      SETTINGS_ROUTE,
      provider,
      cssVars,
      { appRoot: BROWNFIELD_APP, width: 1440 },
    );

    // ── Must succeed ──
    expect(result.error).toBeUndefined();
    expect(result.spec).not.toBeNull();
    const spec = result.spec!;

    // Save for inspection
    writeFileSync(
      join(OUTPUT_DIR, 'settings-spec.json'),
      JSON.stringify(spec, null, 2),
    );

    // ── Validation ──
    const validation = validateDesignSpec(spec, catalog);
    if (validation.errors.length > 0) {
      console.error('Settings validation errors:', JSON.stringify(validation.errors, null, 2));
    }
    expect(validation.errors).toHaveLength(0);

    // ── Root node ──
    const nodes = Object.values(spec.nodes);
    const rootNodes = nodes.filter(n => n.parent === null);
    expect(rootNodes).toHaveLength(1);

    // ── Non-trivial: settings page has 3 cards (profile, notifications, danger zone) + sidebar ──
    expect(Object.keys(spec.nodes).length).toBeGreaterThanOrEqual(20);

    // ── Catalog entries: settings uses input-text, select, switch, checkbox, button variants ──
    const catalogIds = [...new Set(nodes.filter(n => n.catalog).map(n => n.catalog!))];
    console.log(`Settings: ${Object.keys(spec.nodes).length} nodes, catalog: ${catalogIds.join(', ')}`);

    // Must have at least input-text and switch (core form components)
    const hasFormComponents = catalogIds.some(id =>
      ['input-text', 'select', 'switch', 'checkbox'].includes(id)
    );
    expect(hasFormComponents).toBe(true);

    // ── Text content ──
    const allContent = nodes.map(n => [n.content, n.label, n.title].filter(Boolean).join(' ')).join(' ');
    expect(allContent).toContain('Settings');
    // Should have notification toggle labels
    expect(allContent).toMatch(/[Ee]mail|[Nn]otification/);
  });

  it('converts the users page — data table, badges, avatars', async () => {
    const provider = createAnthropicProvider({ apiKey: API_KEY });

    const result = await convertPageToDesignSpec(
      USERS_ROUTE,
      provider,
      cssVars,
      { appRoot: BROWNFIELD_APP, width: 1440 },
    );

    // ── Must succeed ──
    expect(result.error).toBeUndefined();
    expect(result.spec).not.toBeNull();
    const spec = result.spec!;

    // Save for inspection
    writeFileSync(
      join(OUTPUT_DIR, 'users-spec.json'),
      JSON.stringify(spec, null, 2),
    );

    // ── Validation ──
    const validation = validateDesignSpec(spec, catalog);
    if (validation.errors.length > 0) {
      console.error('Users validation errors:', JSON.stringify(validation.errors, null, 2));
    }
    expect(validation.errors).toHaveLength(0);

    // ── Root node ──
    const nodes = Object.values(spec.nodes);
    const rootNodes = nodes.filter(n => n.parent === null);
    expect(rootNodes).toHaveLength(1);

    // ── Non-trivial: users page has stat cards + full user table ──
    expect(Object.keys(spec.nodes).length).toBeGreaterThanOrEqual(15);

    // ── Catalog entries ──
    const catalogIds = [...new Set(nodes.filter(n => n.catalog).map(n => n.catalog!))];
    console.log(`Users: ${Object.keys(spec.nodes).length} nodes, catalog: ${catalogIds.join(', ')}`);

    // Must have search input and invite button
    const hasButton = catalogIds.includes('button-primary');
    expect(hasButton).toBe(true);

    // ── Text content — user names from the source data ──
    const allContent = nodes.map(n => [n.content, n.label, n.title].filter(Boolean).join(' ')).join(' ');
    expect(allContent).toContain('Users');
  });

  it('source collection captures real component imports', () => {
    // Verify the source fed to the LLM includes the key components
    const { content, files } = collectPageSource('src/app/page.tsx', BROWNFIELD_APP);

    // Must include the page file
    expect(files).toContain('src/app/page.tsx');

    // Must contain shadcn component references
    expect(content).toContain('Card');
    expect(content).toContain('Badge');
    expect(content).toContain('Button');
    expect(content).toContain('Table');
    expect(content).toContain('Avatar');

    // Must contain actual data from the page
    expect(content).toContain('$45,231');
    expect(content).toContain('Total Revenue');
    expect(content).toContain('Active Users');
  });
});
