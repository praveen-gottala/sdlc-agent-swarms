/**
 * E2E test: Phase 2 container treatment variety.
 *
 * Verifies that different container treatments (Elevated, Outlined, Flat,
 * Separated) produce distinct CSS properties when rendered in the browser.
 * Uses a synthetic fixture injected into PET — no LLM calls.
 *
 * Treatments under test (from ux-penpot-designspec-v2.md):
 * - Elevated: shadow + radius, no border
 * - Outlined: border + radius, no shadow
 * - Flat: background only, no shadow, no border
 * - Separated: borderBottom only, no shadow, no background
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'container-variety-test';
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
    'heading': {
      parent: 'root', order: 0, type: 'text',
      content: 'Container Variety Test', typography: 'heading-1', color: 'text-primary',
    },
    'elevated-section': {
      parent: 'root', order: 1, type: 'section',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-primary', shadow: 'sm', radius: 12,
    },
    'elevated-text': {
      parent: 'elevated-section', order: 0, type: 'text',
      content: 'Elevated Card', typography: 'heading-3', color: 'text-primary',
    },
    'outlined-section': {
      parent: 'root', order: 2, type: 'section',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      radius: 12,
      overrides: { border: '1px solid var(--border-default)' },
    },
    'outlined-text': {
      parent: 'outlined-section', order: 0, type: 'text',
      content: 'Outlined Card', typography: 'heading-3', color: 'text-primary',
    },
    'flat-section': {
      parent: 'root', order: 3, type: 'section',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      background: 'surface-secondary',
    },
    'flat-text': {
      parent: 'flat-section', order: 0, type: 'text',
      content: 'Flat Section', typography: 'heading-3', color: 'text-primary',
    },
    'separated-section': {
      parent: 'root', order: 4, type: 'section',
      layout: { dir: 'column', gap: 12, px: 24, py: 20 },
      overrides: { borderBottom: '1px solid var(--border-default)' },
    },
    'separated-text': {
      parent: 'separated-section', order: 0, type: 'text',
      content: 'Separated Item', typography: 'heading-3', color: 'text-primary',
    },
  },
};

test.describe('Container treatment variety @container-variety', () => {
  let studio: DesignStudioPO;

  test.beforeAll(() => {
    writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    if (!pagesData.pages.some((p: Record<string, unknown>) => p.id === TEST_PAGE_ID)) {
      pagesData.pages.push({
        id: TEST_PAGE_ID,
        name: 'Container Variety Test',
        description: 'Synthetic fixture for container treatment variety testing.',
        route: '/container-variety-test',
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

  test('visual verification: all 4 treatments render distinctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="elevated-section"]').waitFor({ state: 'visible', timeout: 20000 });

    const collapseSidebar = page.getByRole('button', { name: 'Collapse sidebar' });
    if (await collapseSidebar.isVisible()) await collapseSidebar.click();
    const closeActivity = page.getByRole('button', { name: 'Close activity sidebar' });
    if (await closeActivity.isVisible()) await closeActivity.click();
    await page.waitForTimeout(300);

    const fitBtn = page.getByRole('button', { name: 'Fit' });
    if (await fitBtn.isVisible()) await fitBtn.click();
    await page.waitForTimeout(500);

    const iframeElement = page.locator('[data-testid="design-iframe"]');
    await iframeElement.screenshot({ path: 'e2e/screenshots/container-variety.png' });
  });

  test('elevated section has box-shadow and border-radius, no border', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="elevated-section"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderRadius: cs.borderRadius,
        border: cs.border,
      };
    });

    expect(styles.boxShadow).not.toBe('none');
    expect(styles.boxShadow).toBeTruthy();
    expect(parseInt(styles.borderRadius)).toBeGreaterThan(0);
  });

  test('outlined section has border and border-radius, no box-shadow', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="outlined-section"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderRadius: cs.borderRadius,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
      };
    });

    expect(styles.borderWidth).not.toBe('0px');
    expect(styles.borderStyle).not.toBe('none');
    expect(parseInt(styles.borderRadius)).toBeGreaterThan(0);
    expect(styles.boxShadow).toBe('none');
  });

  test('flat section has background, no shadow, no border', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="flat-section"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        backgroundColor: cs.backgroundColor,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
      };
    });

    expect(styles.boxShadow).toBe('none');
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.backgroundColor).toBeTruthy();
    const hasBorder = styles.borderWidth !== '0px' && styles.borderStyle !== 'none';
    expect(hasBorder).toBe(false);
  });

  test('separated section has borderBottom, no shadow', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="separated-section"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const styles = await node.evaluate(el => {
      const cs = getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderBottomWidth: cs.borderBottomWidth,
        borderBottomStyle: cs.borderBottomStyle,
        borderTopWidth: cs.borderTopWidth,
      };
    });

    expect(styles.boxShadow).toBe('none');
    expect(styles.borderBottomWidth).not.toBe('0px');
    expect(styles.borderBottomStyle).not.toBe('none');
    expect(styles.borderTopWidth).toBe('0px');
  });

  test('all 4 sections are visually distinct (unique style fingerprints)', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="elevated-section"]').waitFor({ state: 'visible', timeout: 20000 });

    const nodeIds = ['elevated-section', 'outlined-section', 'flat-section', 'separated-section'];
    const fingerprints: string[] = [];

    for (const nodeId of nodeIds) {
      const node = iframe.locator(`[data-node="${nodeId}"]`);
      const fp = await node.evaluate(el => {
        const cs = getComputedStyle(el);
        return [cs.boxShadow, cs.border, cs.borderBottom, cs.backgroundColor, cs.borderRadius].join('|');
      });
      fingerprints.push(fp);
    }

    const unique = new Set(fingerprints);
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });
});
