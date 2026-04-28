/**
 * E2E test: Phase 3 catalog variants.
 *
 * Verifies that Card and Section catalog entries render correctly with
 * variant-appropriate overrides (elevated, flat, outlined, inset).
 * Uses a synthetic fixture injected into PET — no LLM calls.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'catalog-variants-test';
const SPEC_PATH = join(PET_ROOT, 'agentforge/designs', `${TEST_PAGE_ID}.json`);
const PAGES_YAML_PATH = join(PET_ROOT, 'agentforge/spec/pages.yaml');

const TEST_SPEC = {
  screen: TEST_PAGE_ID,
  width: 1440,
  nodes: {
    root: {
      parent: null, order: 0, type: 'page',
      layout: { dir: 'column', gap: 24, px: 32, py: 32 },
      background: 'background-primary',
    },
    heading: {
      parent: 'root', order: 0, type: 'text',
      content: 'Catalog Variants Test', typography: 'heading-1', color: 'text-primary',
    },
    // Section catalog variants
    'section-default': {
      parent: 'root', order: 1, catalog: 'Section',
      label: 'Default Section', layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-primary',
    },
    'section-default-child': {
      parent: 'section-default', order: 0, type: 'text',
      content: 'Default section content', typography: 'body', color: 'text-primary',
    },
    'section-flat': {
      parent: 'root', order: 2, catalog: 'Section',
      label: 'Flat Section', layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-secondary',
    },
    'section-flat-child': {
      parent: 'section-flat', order: 0, type: 'text',
      content: 'Flat section content', typography: 'body', color: 'text-primary',
    },
    'section-bordered': {
      parent: 'root', order: 3, catalog: 'Section',
      label: 'Bordered Section', layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      radius: 12, overrides: { border: '1px solid var(--border-default)' },
    },
    'section-bordered-child': {
      parent: 'section-bordered', order: 0, type: 'text',
      content: 'Bordered section content', typography: 'body', color: 'text-primary',
    },
    'section-inset': {
      parent: 'root', order: 4, catalog: 'Section',
      label: 'Inset Section', layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-secondary', overrides: { border: '1px solid var(--border-default)' },
    },
    'section-inset-child': {
      parent: 'section-inset', order: 0, type: 'text',
      content: 'Inset section content', typography: 'body', color: 'text-primary',
    },
    // Card catalog variants
    'card-elevated': {
      parent: 'root', order: 5, catalog: 'Card',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-primary', shadow: 'sm', radius: 12,
    },
    'card-elevated-text': {
      parent: 'card-elevated', order: 0, type: 'text',
      content: 'Elevated Card', typography: 'heading-3', color: 'text-primary',
    },
    'card-flat': {
      parent: 'root', order: 6, catalog: 'Card',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-secondary',
    },
    'card-flat-text': {
      parent: 'card-flat', order: 0, type: 'text',
      content: 'Flat Card', typography: 'heading-3', color: 'text-primary',
    },
    'card-outlined': {
      parent: 'root', order: 7, catalog: 'Card',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      radius: 12, overrides: { border: '1px solid var(--border-default)' },
    },
    'card-outlined-text': {
      parent: 'card-outlined', order: 0, type: 'text',
      content: 'Outlined Card', typography: 'heading-3', color: 'text-primary',
    },
  },
};

test.describe('Catalog variants @catalog-variants', () => {
  let studio: DesignStudioPO;

  test.beforeAll(() => {
    writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    if (!pagesData.pages.some((p: Record<string, unknown>) => p.id === TEST_PAGE_ID)) {
      pagesData.pages.push({
        id: TEST_PAGE_ID,
        name: 'Catalog Variants Test',
        description: 'Synthetic fixture for catalog variant testing.',
        route: '/catalog-variants-test',
        status: 'approved',
        designStatus: 'rendered',
      });
      writeFileSync(PAGES_YAML_PATH, stringify(pagesData, { lineWidth: 120 }));
    }
  });

  test.afterAll(() => {
    if (existsSync(SPEC_PATH)) unlinkSync(SPEC_PATH);

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    pagesData.pages = pagesData.pages.filter((p: Record<string, unknown>) => p.id !== TEST_PAGE_ID);
    writeFileSync(PAGES_YAML_PATH, stringify(pagesData, { lineWidth: 120 }));
  });

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 30000 });
  });

  test('catalog Section renders with semantic HTML and heading from label', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const section = iframe.locator('[data-node="section-default"]');
    await section.waitFor({ state: 'visible', timeout: 20000 });

    const tagName = await section.evaluate(el => el.tagName.toLowerCase());
    expect(tagName).toBe('section');

    const role = await section.getAttribute('role');
    expect(role).toBe('region');

    const heading = iframe.locator('[data-node="section-default"] h2');
    await expect(heading).toHaveText('Default Section');
  });

  test('Section flat variant: background, no shadow, no border', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="section-flat"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const heading = iframe.locator('[data-node="section-flat"] h2');
    await expect(heading).toHaveText('Flat Section');

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow, backgroundColor: cs.backgroundColor, borderWidth: cs.borderWidth };
    });
    expect(styles.boxShadow).toBe('none');
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.borderWidth).toBe('0px');
  });

  test('Section bordered variant: border + radius, no shadow', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="section-bordered"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        borderRadius: cs.borderRadius,
      };
    });
    expect(styles.boxShadow).toBe('none');
    expect(styles.borderWidth).not.toBe('0px');
    expect(styles.borderStyle).not.toBe('none');
    expect(parseInt(styles.borderRadius)).toBeGreaterThan(0);
  });

  test('Section inset variant: background + border', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="section-inset"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        backgroundColor: cs.backgroundColor,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
      };
    });
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.borderWidth).not.toBe('0px');
    expect(styles.borderStyle).not.toBe('none');
  });

  test('Card elevated variant: shadow + radius', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="card-elevated"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow, borderRadius: cs.borderRadius };
    });
    expect(styles.boxShadow).not.toBe('none');
    expect(parseInt(styles.borderRadius)).toBeGreaterThan(0);
  });

  test('Card flat variant: background only, no shadow', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="card-flat"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow, backgroundColor: cs.backgroundColor };
    });
    expect(styles.boxShadow).toBe('none');
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('Card outlined variant: border + radius, no shadow', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="card-outlined"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        borderRadius: cs.borderRadius,
      };
    });
    expect(styles.boxShadow).toBe('none');
    expect(styles.borderWidth).not.toBe('0px');
    expect(styles.borderStyle).not.toBe('none');
    expect(parseInt(styles.borderRadius)).toBeGreaterThan(0);
  });

  test('all catalog variants render with distinct style fingerprints', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="section-default"]').waitFor({ state: 'visible', timeout: 20000 });

    const nodeIds = [
      'section-default', 'section-flat', 'section-bordered', 'section-inset',
      'card-elevated', 'card-flat', 'card-outlined',
    ];
    const fingerprints: string[] = [];
    for (const nodeId of nodeIds) {
      const node = iframe.locator(`[data-node="${nodeId}"]`);
      const fp = await node.evaluate(el => {
        const cs = getComputedStyle(el);
        return [cs.boxShadow, cs.border, cs.backgroundColor, cs.borderRadius].join('|');
      });
      fingerprints.push(fp);
    }

    const unique = new Set(fingerprints);
    expect(unique.size).toBeGreaterThanOrEqual(4);
  });
});
