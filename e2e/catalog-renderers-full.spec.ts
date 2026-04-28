/**
 * E2E test: Prerequisite P.2–P.6 — Remaining 12 catalog renderers.
 *
 * Verifies that Radio, TextArea, DatePicker, Modal, LoadingSpinner, Skeleton,
 * Breadcrumb, StepIndicator, Form, SelectionGrid, FilterBar, and EmptyState
 * render with correct anatomy — not as generic containers.
 *
 * Uses a synthetic fixture injected into PET — no LLM calls.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'catalog-renderers-full-test';
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

    // ── Input components ──
    'radio-node': {
      parent: 'root', order: 0,
      catalog: 'Radio',
      label: 'Option A',
      overrides: { selected: true },
    },
    'radio-unselected': {
      parent: 'root', order: 1,
      catalog: 'Radio',
      label: 'Option B',
    },
    'textarea-node': {
      parent: 'root', order: 2,
      catalog: 'TextArea',
      label: 'Description',
      placeholder: 'Enter your description...',
      overrides: { helper: 'Max 500 characters' },
    },
    'datepicker-node': {
      parent: 'root', order: 3,
      catalog: 'DatePicker',
      label: 'Start Date',
      placeholder: 'Select a date...',
    },

    // ── Feedback components ──
    'modal-node': {
      parent: 'root', order: 4,
      catalog: 'Modal',
      label: 'Confirm Action',
      content: 'Are you sure you want to proceed?',
      width: 480,
    },
    'spinner-node': {
      parent: 'root', order: 5,
      catalog: 'LoadingSpinner',
      label: 'Loading data...',
    },
    'skeleton-node': {
      parent: 'root', order: 6,
      catalog: 'Skeleton',
      width: 300,
      height: 20,
    },

    // ── Navigation components ──
    'breadcrumb-node': {
      parent: 'root', order: 7,
      catalog: 'Breadcrumb',
      items: [
        { label: 'Home' },
        { label: 'Settings' },
        { label: 'Profile' },
      ],
    },
    'step-indicator-node': {
      parent: 'root', order: 8,
      catalog: 'StepIndicator',
      items: [
        { label: 'Account', state: 'completed' },
        { label: 'Profile', state: 'active' },
        { label: 'Review', state: 'default' },
      ],
    },

    // ── Composite components ──
    'form-node': {
      parent: 'root', order: 9,
      catalog: 'Form',
      label: 'Registration Form',
      layout: { dir: 'column', gap: 16 },
    },
    'form-input': {
      parent: 'form-node', order: 0,
      catalog: 'input-text',
      label: 'Full Name',
      placeholder: 'Enter your name',
    },
    'selection-grid-node': {
      parent: 'root', order: 10,
      catalog: 'SelectionGrid',
      label: 'Choose a plan',
      layout: { dir: 'row', gap: 16 },
    },
    'grid-item-1': {
      parent: 'selection-grid-node', order: 0, type: 'text',
      content: 'Basic Plan', typography: 'body', color: 'text-primary',
    },
    'grid-item-2': {
      parent: 'selection-grid-node', order: 1, type: 'text',
      content: 'Pro Plan', typography: 'body', color: 'text-primary',
    },
    'filter-bar-node': {
      parent: 'root', order: 11,
      catalog: 'FilterBar',
    },
    'filter-chip': {
      parent: 'filter-bar-node', order: 0,
      catalog: 'chip',
      label: 'Active',
      overrides: { selected: true },
    },

    // ── Data display component ──
    'empty-state-node': {
      parent: 'root', order: 12,
      catalog: 'EmptyState',
      label: 'No results found',
      content: 'Try adjusting your search or filters.',
      overrides: { icon: 'search' },
    },
  },
};

test.describe('Full catalog renderers @catalog-full', () => {
  let studio: DesignStudioPO;

  test.beforeAll(() => {
    writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

    const pagesRaw = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pagesData = parse(pagesRaw) as { pages: Array<Record<string, unknown>> };
    if (!pagesData.pages.some((p: Record<string, unknown>) => p.id === TEST_PAGE_ID)) {
      pagesData.pages.push({
        id: TEST_PAGE_ID,
        name: 'Full Catalog Renderers Test',
        description: 'Synthetic fixture for all remaining catalog renderer testing.',
        route: '/catalog-renderers-full-test',
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

  test('visual verification: all 12 components render', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1200 });
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    await iframe.locator('[data-node="radio-node"]').waitFor({ state: 'visible', timeout: 20000 });

    const collapseSidebar = page.getByRole('button', { name: 'Collapse sidebar' });
    if (await collapseSidebar.isVisible()) await collapseSidebar.click();
    const closeActivity = page.getByRole('button', { name: 'Close activity sidebar' });
    if (await closeActivity.isVisible()) await closeActivity.click();
    await page.waitForTimeout(300);

    const iframeElement = page.locator('[data-testid="design-iframe"]');
    await iframeElement.screenshot({ path: 'e2e/screenshots/catalog-renderers-full.png' });
  });

  // ── Input renderers ──

  test('Radio renders with circle indicator and label', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="radio-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      display: getComputedStyle(el).display,
      text: el.textContent,
    }));

    expect(info.catalog).toBe('radio');
    expect(info.display).toBe('flex');
    expect(info.text).toContain('Option A');
  });

  test('TextArea renders with label and textarea element', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="textarea-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      hasTextarea: !!el.querySelector('textarea'),
      hasLabel: !!el.querySelector('label'),
    }));

    expect(info.catalog).toBe('text-area');
    expect(info.hasTextarea).toBe(true);
    expect(info.hasLabel).toBe(true);
  });

  test('DatePicker renders with input and calendar icon', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="datepicker-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      hasInput: !!el.querySelector('input'),
      hasSvg: !!el.querySelector('svg'),
      hasLabel: !!el.querySelector('label'),
    }));

    expect(info.catalog).toBe('date-picker');
    expect(info.hasInput).toBe(true);
    expect(info.hasSvg).toBe(true);
    expect(info.hasLabel).toBe(true);
  });

  // ── Feedback renderers ──

  test('Modal renders with dialog role and title', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="modal-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    expect(await node.getAttribute('data-catalog')).toBe('modal');

    const dialog = iframe.locator('[data-node="modal-node"] [role="dialog"]');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.locator('h2')).toContainText('Confirm Action');
  });

  test('LoadingSpinner renders with status role and animation', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="spinner-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      text: el.textContent,
    }));

    expect(info.catalog).toBe('loading-spinner');
    expect(info.role).toBe('status');
    expect(info.ariaLabel).toBe('Loading');
    expect(info.text).toContain('Loading data...');
  });

  test('Skeleton renders with correct dimensions', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="skeleton-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      width: getComputedStyle(el).width,
      height: getComputedStyle(el).height,
    }));

    expect(info.catalog).toBe('skeleton');
    expect(parseInt(info.width)).toBe(300);
    expect(parseInt(info.height)).toBe(20);
  });

  // ── Navigation renderers ──

  test('Breadcrumb renders with navigation role and items', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="breadcrumb-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      tagName: el.tagName,
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      text: el.textContent,
    }));

    expect(info.tagName).toBe('NAV');
    expect(info.catalog).toBe('breadcrumb');
    expect(info.role).toBe('navigation');
    expect(info.ariaLabel).toBe('Breadcrumb');
    expect(info.text).toContain('Home');
    expect(info.text).toContain('Profile');
  });

  test('StepIndicator renders with numbered steps', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="step-indicator-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      text: el.textContent,
    }));

    expect(info.catalog).toBe('step-indicator');
    expect(info.role).toBe('group');
    expect(info.text).toContain('Account');
    expect(info.text).toContain('Profile');
    expect(info.text).toContain('Review');
  });

  // ── Composite renderers ──

  test('Form renders as <form> with role=form', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="form-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      tagName: el.tagName,
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
    }));

    expect(info.tagName).toBe('FORM');
    expect(info.catalog).toBe('form');
    expect(info.role).toBe('form');
    expect(info.ariaLabel).toBe('Registration Form');
  });

  test('SelectionGrid renders with group role', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="selection-grid-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      text: el.textContent,
    }));

    expect(info.catalog).toBe('selection-grid');
    expect(info.role).toBe('group');
    expect(info.text).toContain('Basic Plan');
    expect(info.text).toContain('Pro Plan');
  });

  test('FilterBar renders with search role', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="filter-bar-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      role: el.getAttribute('role'),
      display: getComputedStyle(el).display,
      flexDirection: getComputedStyle(el).flexDirection,
    }));

    expect(info.catalog).toBe('filter-bar');
    expect(info.role).toBe('search');
    expect(info.display).toBe('flex');
    expect(info.flexDirection).toBe('row');
  });

  // ── Data display renderer ──

  test('EmptyState renders with centered layout and icon', async ({ page }) => {
    await studio.selectPage(TEST_PAGE_ID);
    await expect(page).toHaveURL(new RegExp(`page=${TEST_PAGE_ID}`), { timeout: 5000 });
    await studio.waitForIframeReady();

    const iframe = page.frameLocator('[data-testid="design-iframe"]');
    const node = iframe.locator('[data-node="empty-state-node"]');
    await node.waitFor({ state: 'visible', timeout: 20000 });

    const info = await node.evaluate(el => ({
      catalog: el.getAttribute('data-catalog'),
      textAlign: getComputedStyle(el).textAlign,
      alignItems: getComputedStyle(el).alignItems,
      hasSvg: !!el.querySelector('svg'),
      text: el.textContent,
    }));

    expect(info.catalog).toBe('empty-state');
    expect(info.textAlign).toBe('center');
    expect(info.alignItems).toBe('center');
    expect(info.hasSvg).toBe(true);
    expect(info.text).toContain('No results found');
    expect(info.text).toContain('Try adjusting your search or filters');
  });
});
