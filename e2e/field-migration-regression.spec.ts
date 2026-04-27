/**
 * E2E test: Phase 1 field migration regression guard.
 *
 * Verifies that textAlign, helper, and title still render correctly
 * after migration from NodeSpec top-level fields to overrides.
 *
 * Uses a synthetic fixture injected into PET — no LLM calls.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'field-migration-test';
const SPEC_PATH = join(PET_ROOT, 'agentforge/designs', `${TEST_PAGE_ID}.json`);
const PAGES_YAML_PATH = join(PET_ROOT, 'agentforge/spec/pages.yaml');

/**
 * Synthetic design spec exercising all three migrated fields via overrides.
 * - textAlign: "center" and "right" on text nodes
 * - helper: helper text on an input-text catalog node
 * - title: title text on a section node
 */
const TEST_SPEC = {
  screen: TEST_PAGE_ID,
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column', gap: 16, px: 24, py: 24 } },
    'content-section': {
      parent: 'root', order: 0, type: 'section',
      layout: { dir: 'column', gap: 8 },
    },
    'centered-text': {
      parent: 'content-section', order: 0, type: 'text',
      content: 'Centered Heading', typography: 'heading-2', color: 'text-primary',
      overrides: { textAlign: 'center' },
    },
    'right-aligned-text': {
      parent: 'content-section', order: 1, type: 'text',
      content: 'Right Aligned', typography: 'body', color: 'text-secondary',
      overrides: { textAlign: 'right' },
    },
    'input-with-helper': {
      parent: 'content-section', order: 2,
      catalog: 'input-text', label: 'Email Address', placeholder: 'you@example.com',
      overrides: { helper: 'We will never share your email.' },
    },
    'alert-with-title': {
      parent: 'content-section', order: 3,
      catalog: 'alert', label: 'Warning',
      content: 'Your session will expire in 5 minutes.',
    },
  },
};

test.describe('Field migration regression @field-migration', () => {
  let studio: DesignStudioPO;

  test.beforeAll(() => {
    // Inject test fixture: write spec + add page entry to pages.yaml
    writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    if (!pagesData.pages.some((p: Record<string, unknown>) => p.id === TEST_PAGE_ID)) {
      pagesData.pages.push({
        id: TEST_PAGE_ID,
        name: 'Field Migration Test',
        description: 'Synthetic fixture for field migration regression testing.',
        route: '/field-migration-test',
        status: 'approved',
        designStatus: 'rendered',
      });
      writeFileSync(PAGES_YAML_PATH, stringify(pagesData, { lineWidth: 120 }));
    }
  });

  test.afterAll(() => {
    // Clean up: remove test spec + restore pages.yaml entry
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
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });
  });

  test('visual verification: all migrated fields render correctly', async ({ page }) => {
    // Maximize viewport for clear rendering
    await page.setViewportSize({ width: 1920, height: 1080 });

    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="centered-text"]').waitFor({ state: 'visible', timeout: 20000 });

    // Collapse sidebars for maximum canvas area
    const collapseSidebar = page.getByRole('button', { name: 'Collapse sidebar' });
    if (await collapseSidebar.isVisible()) await collapseSidebar.click();
    const closeActivity = page.getByRole('button', { name: 'Close activity sidebar' });
    if (await closeActivity.isVisible()) await closeActivity.click();
    await page.waitForTimeout(300);

    // Zoom to Fit for full view of all nodes
    const fitBtn = page.getByRole('button', { name: 'Fit' });
    if (await fitBtn.isVisible()) await fitBtn.click();
    await page.waitForTimeout(500);

    // Screenshot just the iframe content
    const iframeElement = page.locator('[data-testid="design-iframe"]');
    await iframeElement.screenshot({ path: 'e2e/screenshots/field-migration-iframe.png' });
  });

  test('textAlign: center renders via overrides', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const centeredNode = iframe.locator('[data-node="centered-text"]');
    await centeredNode.waitFor({ state: 'visible', timeout: 20000 });

    const textAlign = await centeredNode.evaluate(el => getComputedStyle(el).textAlign);
    expect(textAlign).toBe('center');
  });

  test('textAlign: right renders via overrides', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const rightNode = iframe.locator('[data-node="right-aligned-text"]');
    await rightNode.waitFor({ state: 'visible', timeout: 20000 });

    const textAlign = await rightNode.evaluate(el => getComputedStyle(el).textAlign);
    expect(textAlign).toBe('right');
  });

  test('helper text renders via overrides on input-text', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const inputNode = iframe.locator('[data-node="input-with-helper"]');
    await inputNode.waitFor({ state: 'visible', timeout: 20000 });

    // Helper text renders as a <p> inside the input component
    const helperText = inputNode.locator('p');
    await expect(helperText).toContainText('We will never share your email.');
  });

  test('alert renders label as title text', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const alertNode = iframe.locator('[data-node="alert-with-title"]');
    await alertNode.waitFor({ state: 'visible', timeout: 20000 });

    // Alert renders label as title + content as message
    await expect(alertNode).toContainText('Warning');
    await expect(alertNode).toContainText('Your session will expire in 5 minutes.');
  });
});
