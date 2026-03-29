/**
 * @module render-pipeline.integration.test
 * Integration tests: load real YAML tokens/catalog from disk, render app-specific
 * fixtures through the full pipeline, verify data flows end-to-end.
 *
 * Imports only from the public barrel (../../src/index.js).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  renderToScript,
  loadCatalogForRenderer,
  validateDesignSpec,
} from '../src/index.js';
import type { DesignSpecV2, RendererTokens, RawCatalogSpec } from '../src/index.js';
import { SAMPLE_TOKENS } from '../src/__fixtures__/design-tokens.js';
import { V2_BUILTIN_CATALOG } from '../src/__fixtures__/catalog-entries.js';

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

const APP_FIXTURES = join(__dirname, 'fixtures/test-app-splitwise');

function loadYamlTokens(yamlPath: string): RendererTokens {
  const raw = parseYaml(readFileSync(yamlPath, 'utf-8'));
  return {
    colors: raw.colors,
    typography: raw.typography,
    elevation: raw.elevation,
    borders: raw.borders,
    spacing: raw.spacing,
  };
}

function loadAppSpec(name: string): DesignSpecV2 {
  return JSON.parse(readFileSync(join(APP_FIXTURES, `${name}.json`), 'utf-8'));
}

/* ================================================================== */
/*  Group 1: YAML token loading → render                               */
/* ================================================================== */
describe('YAML token loading', () => {
  const yamlTokens = loadYamlTokens(join(APP_FIXTURES, 'design-tokens.yaml'));

  it('1.1 — YAML tokens produce identical output to SAMPLE_TOKENS', () => {
    const genericSpec: DesignSpecV2 = JSON.parse(
      readFileSync(join(__dirname, '../src/__fixtures__/settings-form.json'), 'utf-8'),
    );

    const resultYaml = renderToScript(genericSpec, yamlTokens, V2_BUILTIN_CATALOG);
    const resultSample = renderToScript(genericSpec, SAMPLE_TOKENS, V2_BUILTIN_CATALOG);

    expect(resultYaml.script).toBe(resultSample.script);
    expect(resultYaml.nodeIds).toEqual(resultSample.nodeIds);
    expect(resultYaml.warnings).toEqual(resultSample.warnings);
  });

  it('1.2 — YAML token hex values appear in rendered script', () => {
    const spec = loadAppSpec('bill-entry');
    const result = renderToScript(spec, yamlTokens, V2_BUILTIN_CATALOG);

    // These hex values come from the YAML primitive colors
    expect(result.script).toContain('#FFF8E7'); // warm-cream
    expect(result.script).toContain('#0F6E56'); // deep-teal
  });
});

/* ================================================================== */
/*  Group 2: YAML catalog loading → render                             */
/* ================================================================== */
describe('YAML catalog loading', () => {
  const yamlTokens = loadYamlTokens(join(APP_FIXTURES, 'design-tokens.yaml'));
  const rawCatalog: RawCatalogSpec = parseYaml(
    readFileSync(join(APP_FIXTURES, 'component-catalog.yaml'), 'utf-8'),
  );

  it('2.1 — catalog from YAML merges with built-ins', () => {
    const merged = loadCatalogForRenderer(rawCatalog, yamlTokens);
    const builtInOnly = loadCatalogForRenderer();

    const mergedKeys = Object.keys(merged);
    const builtInKeys = Object.keys(builtInOnly);

    // Merged catalog has entries from both project and built-in
    expect(mergedKeys.length).toBeGreaterThanOrEqual(builtInKeys.length);
    // Built-in entries still present
    expect(merged['button-primary']).toBeDefined();
    expect(merged['input-text']).toBeDefined();
    // Project entries present (PascalCase -> kebab-case)
    expect(merged['card']).toBeDefined();
    expect(merged['badge']).toBeDefined();
  });

  it('2.2 — project catalog entries override built-in defaults', () => {
    const merged = loadCatalogForRenderer(rawCatalog, yamlTokens);

    // The YAML 'Card' overrides the built-in 'card' entry
    const yamlCard = merged['card'];
    expect(yamlCard).toBeDefined();
    // YAML field (text_typography from token_bindings.font = heading-3)
    expect(yamlCard.text_typography).toBe('heading-3');

    // Render with merged catalog to prove the merge flows through
    const spec: DesignSpecV2 = {
      screen: 'catalog-override-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        myCard: { parent: 'root', order: 0, catalog: 'card' },
      },
    };

    const resultMerged = renderToScript(spec, SAMPLE_TOKENS, merged);
    expect(resultMerged.nodeIds).toContain('myCard');
  });
});

/* ================================================================== */
/*  Group 3: Full pipeline with app fixtures                           */
/* ================================================================== */
describe('Full pipeline with app fixtures', () => {
  const yamlTokens = loadYamlTokens(join(APP_FIXTURES, 'design-tokens.yaml'));
  const rawCatalog: RawCatalogSpec = parseYaml(
    readFileSync(join(APP_FIXTURES, 'component-catalog.yaml'), 'utf-8'),
  );
  const catalog = loadCatalogForRenderer(rawCatalog, yamlTokens);

  it('3.1 — bill-entry.json + YAML tokens + YAML catalog → valid script', () => {
    const spec = loadAppSpec('bill-entry');
    const result = renderToScript(spec, yamlTokens, catalog);

    // Valid JavaScript
    expect(() => new Function('penpot', result.script)).not.toThrow();
    // Correct node count
    expect(result.nodeIds.length).toBe(Object.keys(spec.nodes).length);
    // No warnings
    expect(result.warnings).toEqual([]);
  });

  it('3.2 — split-breakdown.json + YAML tokens + YAML catalog → valid script', () => {
    const spec = loadAppSpec('split-breakdown');
    const result = renderToScript(spec, yamlTokens, catalog);

    // Valid JavaScript
    expect(() => new Function('penpot', result.script)).not.toThrow();
    // Correct node count
    expect(result.nodeIds.length).toBe(Object.keys(spec.nodes).length);
    // No warnings
    expect(result.warnings).toEqual([]);
  });

  it('3.3 — validate then render bill-entry with full YAML pipeline', () => {
    const spec = loadAppSpec('bill-entry');

    const validation = validateDesignSpec(spec, catalog);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    const result = renderToScript(spec, yamlTokens, catalog);
    expect(result.script.length).toBeGreaterThan(0);
    expect(result.nodeIds.length).toBe(Object.keys(spec.nodes).length);
  });
});

/* ================================================================== */
/*  Group 4: Content verification (data actually flows)                */
/* ================================================================== */
describe('Content verification — data flow', () => {
  const yamlTokens = loadYamlTokens(join(APP_FIXTURES, 'design-tokens.yaml'));

  it('4.1 — YAML token hex values appear in script token map', () => {
    const spec = loadAppSpec('bill-entry');
    const result = renderToScript(spec, yamlTokens, V2_BUILTIN_CATALOG);

    // Extract the token map block: const T = new Proxy({ ... }, { ... });
    const tokenMapMatch = result.script.match(/const T = new Proxy\(\{([^}]+)\}/);
    expect(tokenMapMatch).not.toBeNull();
    const tokenMap = tokenMapMatch![0];

    // backgroundPrimary should resolve warm-cream -> #FFF8E7
    expect(tokenMap).toContain('#FFF8E7');
    // ctaPrimary should resolve deep-teal -> #0F6E56
    expect(tokenMap).toContain('#0F6E56');
  });

  it('4.2 — YAML token typography values flow into rendered text nodes', () => {
    // Use a spec with a text node that references heading-3 typography
    // heading-3 in YAML tokens = size 18, weight 600, family display (Nunito)
    const spec: DesignSpecV2 = {
      screen: 'typography-flow-test',
      width: 1440,
      nodes: {
        root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
        title: {
          parent: 'root',
          order: 0,
          type: 'text',
          content: 'Test Heading',
          typography: 'heading-3',
          color: 'text-primary',
        },
      },
    };

    const result = renderToScript(spec, yamlTokens, V2_BUILTIN_CATALOG);

    // heading-3: size 18, weight 600 from YAML tokens
    expect(result.script).toContain('makeText(');
    // fontSize = 18
    expect(result.script).toMatch(/makeText\([^)]*18/);
    // fontWeight = 600 (passed as number arg, converted to string inside makeText)
    expect(result.script).toMatch(/makeText\([^)]*600/);
  });
});
