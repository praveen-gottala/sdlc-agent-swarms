/**
 * E2E test: Prerequisite P.1 — Layout catalog renderers.
 *
 * Verifies that Section, PageHeader, Footer, and Sidebar catalog components
 * render with correct semantic HTML, ARIA attributes, and styling — not as
 * generic containers.
 *
 * Uses a synthetic fixture injected into PET — no LLM calls.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'layout-catalog-test';
const SPEC_PATH = join(PET_ROOT, 'agentforge/designs', `${TEST_PAGE_ID}.json`);
const PAGES_YAML_PATH = join(PET_ROOT, 'agentforge/spec/pages.yaml');

const TEST_SPEC = {
  screen: TEST_PAGE_ID,
  width: 1440,
  nodes: {
    root: {
      parent: null, order: 0, type: 'page',
      layout: { dir: 'column', gap: 0 },
      background: 'background-primary',
    },
    'page-hdr': {
      parent: 'root', order: 0,
      catalog: 'PageHeader',
      label: 'Dashboard Settings',
      content: 'Manage your account preferences',
      layout: { dir: 'column', gap: 8, px: 32, py: 24 },
    },
    'main-layout': {
      parent: 'root', order: 1, type: 'container',
      layout: { dir: 'row', gap: 0 },
      width: 'fill',
    },
    'nav-sidebar': {
      parent: 'main-layout', order: 0,
      catalog: 'Sidebar',
      layout: { dir: 'column', gap: 8, px: 16, py: 16 },
      width: 240,
    },
    'sidebar-link-1': {
      parent: 'nav-sidebar', order: 0, type: 'text',
      content: 'General', typography: 'body', color: 'text-primary',
    },
    'sidebar-link-2': {
      parent: 'nav-sidebar', order: 1, type: 'text',
      content: 'Security', typography: 'body', color: 'text-secondary',
    },
    'content-section': {
      parent: 'main-layout', order: 1,
      catalog: 'Section',
      label: 'Account Settings',
      content: 'Update your account details below.',
      layout: { dir: 'column', gap: 16, px: 32, py: 24 },
      width: 'fill',
    },
    'section-child': {
      parent: 'content-section', order: 0, type: 'text',
      content: 'Your profile information is visible to other users.',
      typography: 'body', color: 'text-primary',
    },
    'page-footer': {
      parent: 'root', order: 2,
      catalog: 'Footer',
      content: '2024 Acme Corp. All rights reserved.',
      layout: { dir: 'column', gap: 24, px: 32, py: 32 },
      background: 'surface-secondary',
    },
    'footer-link': {
      parent: 'page-footer', order: 0, type: 'text',
      content: 'Privacy Policy', typography: 'small', color: 'text-secondary',
    },
  },
};

test.describe('Layout catalog renderers @layout-catalog', () => {
  let studio: DesignStudioPO;

  test.beforeAll(() => {
    writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    if (!pagesData.pages.some((p: Record<string, unknown>) => p.id === TEST_PAGE_ID)) {
      pagesData.pages.push({
        id: TEST_PAGE_ID,
        name: 'Layout Catalog Test',
        description: 'Synthetic fixture for layout catalog renderer testing.',
        route: '/layout-catalog-test',
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

  test('visual verification: all 4 layout components render', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="content-section"]').waitFor({ state: 'visible', timeout: 20000 });

    const collapseSidebar = page.getByRole('button', { name: 'Collapse sidebar' });
    if (await collapseSidebar.isVisible()) await collapseSidebar.click();
    const closeActivity = page.getByRole('button', { name: 'Close activity sidebar' });
    if (await closeActivity.isVisible()) await closeActivity.click();
    await page.waitForTimeout(300);

    const fitBtn = page.getByRole('button', { name: 'Fit' });
    if (await fitBtn.isVisible()) await fitBtn.click();
    await page.waitForTimeout(500);

    const iframeElement = page.locator('[data-testid="design-iframe"]');
    await iframeElement.screenshot({ path: 'e2e/screenshots/layout-catalog-renderers.png' });
  });

  test('Section renders as <section> with role=region', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="content-section"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      tagName: el.tagName,
      role: el.getAttribute('role'),
      catalog: el.getAttribute('data-catalog'),
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
    }));

    expect(info.tagName).toBe('SECTION');
    expect(info.role).toBe('region');
    expect(info.catalog).toBe('section');
    expect(info.display).toBe('flex');
    expect(info.flexDirection).toBe('column');

    await expect(node.locator('h2')).toContainText('Account Settings');
  });

  test('PageHeader renders with role=banner and heading', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="page-hdr"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      role: el.getAttribute('role'),
      catalog: el.getAttribute('data-catalog'),
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
    }));

    expect(info.role).toBe('banner');
    expect(info.catalog).toBe('page-header');
    expect(info.display).toBe('flex');
    expect(info.flexDirection).toBe('column');

    await expect(node.locator('h1')).toContainText('Dashboard Settings');
    await expect(node.locator('p')).toContainText('Manage your account preferences');
  });

  test('Footer renders as <footer> with role=contentinfo', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="page-footer"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      tagName: el.tagName,
      role: el.getAttribute('role'),
      catalog: el.getAttribute('data-catalog'),
      backgroundColor: getComputedStyle(el).backgroundColor,
    }));

    expect(info.tagName).toBe('FOOTER');
    expect(info.role).toBe('contentinfo');
    expect(info.catalog).toBe('footer');
    expect(info.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('Sidebar renders as <aside> with navigation role', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="nav-sidebar"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      tagName: el.tagName,
      catalog: el.getAttribute('data-catalog'),
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
      backgroundColor: getComputedStyle(el).backgroundColor,
    }));

    expect(info.tagName).toBe('ASIDE');
    expect(info.catalog).toBe('sidebar');
    expect(info.display).toBe('flex');
    expect(info.flexDirection).toBe('column');
    expect(info.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');

    const nav = iframe.locator('[data-node="nav-sidebar"] nav[role="navigation"]');
    await expect(nav).toHaveAttribute('aria-label', 'Sidebar navigation');
  });

  test('semantic diversity: at least 3 distinct HTML tags', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="content-section"]').waitFor({ state: 'visible', timeout: 20000 });

    const tags = await Promise.all([
      iframe.locator('[data-node="page-hdr"]').evaluate(el => el.tagName),
      iframe.locator('[data-node="content-section"]').evaluate(el => el.tagName),
      iframe.locator('[data-node="page-footer"]').evaluate(el => el.tagName),
      iframe.locator('[data-node="nav-sidebar"]').evaluate(el => el.tagName),
    ]);

    const uniqueTags = new Set(tags);
    expect(uniqueTags.size).toBeGreaterThanOrEqual(3);
  });
});
