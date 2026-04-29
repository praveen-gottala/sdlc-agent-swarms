/**
 * E2E test: Phase 3.6 catalog promotion post-processor.
 *
 * Verifies that promoted nodes (container→Section, container→Form,
 * header→PageHeader) render with proper semantic HTML and ARIA roles.
 * Uses a synthetic fixture with already-promoted nodes.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const TEST_PAGE_ID = 'catalog-promotion-test';
const SPEC_PATH = join(PET_ROOT, 'agentforge/designs', `${TEST_PAGE_ID}.json`);
const PAGES_YAML_PATH = join(PET_ROOT, 'agentforge/spec/pages.yaml');

const TEST_SPEC = {
  screen: TEST_PAGE_ID,
  width: 1440,
  nodes: {
    root: {
      parent: null, order: 0, type: 'page' as const,
      layout: { dir: 'column' as const, gap: 0 },
      background: 'background-primary',
    },
    'page-header': {
      parent: 'root', order: 0, catalog: 'PageHeader',
      label: 'Promotion Test',
      layout: { dir: 'row' as const, align: 'center' as const, px: 32, py: 16 },
      background: 'surface-primary', shadow: 'sm',
      overrides: { __promoted: true },
    },
    content: {
      parent: 'root', order: 1, type: 'container' as const,
      layout: { dir: 'column' as const, gap: 24, px: 32, py: 24 },
    },
    'profile-section': {
      parent: 'content', order: 0, catalog: 'Section',
      label: 'Profile Information',
      layout: { dir: 'column' as const, gap: 16, px: 24, py: 20 },
      background: 'surface-primary', shadow: 'sm', radius: 12,
      overrides: { __promoted: true },
    },
    'name-input': {
      parent: 'profile-section', order: 0, catalog: 'input-text',
      label: 'Full Name', placeholder: 'Jane Cooper', width: 'fill' as const,
    },
    'email-input': {
      parent: 'profile-section', order: 1, catalog: 'input-text',
      label: 'Email', placeholder: 'jane@example.com', width: 'fill' as const,
    },
    'contact-form': {
      parent: 'content', order: 1, catalog: 'Form',
      layout: { dir: 'column' as const, gap: 16, px: 24, py: 20 },
      radius: 12,
      overrides: { border: '1px solid var(--border-default)', __promoted: true },
    },
    'phone-input': {
      parent: 'contact-form', order: 0, catalog: 'input-text',
      label: 'Phone', placeholder: '+1 555-0123', width: 'fill' as const,
    },
    'country-select': {
      parent: 'contact-form', order: 1, catalog: 'select',
      label: 'Country', placeholder: 'Select country',
    },
    'save-btn': {
      parent: 'contact-form', order: 2, catalog: 'button-primary',
      label: 'Save',
    },
    'page-footer': {
      parent: 'root', order: 2, catalog: 'Footer',
      layout: { dir: 'row' as const, justify: 'end' as const, px: 32, py: 16 },
    },
    'footer-text': {
      parent: 'page-footer', order: 0, type: 'text' as const,
      content: '2026 AppName', typography: 'small', color: 'text-secondary',
    },
  },
};

let originalPagesYaml: string | null = null;

test.beforeAll(async () => {
  writeFileSync(SPEC_PATH, JSON.stringify(TEST_SPEC, null, 2));

  if (existsSync(PAGES_YAML_PATH)) {
    originalPagesYaml = readFileSync(PAGES_YAML_PATH, 'utf-8');
    const pages = parse(originalPagesYaml);
    if (pages.pages && !pages.pages.find((p: { id: string }) => p.id === TEST_PAGE_ID)) {
      pages.pages.push({
        id: TEST_PAGE_ID,
        title: 'Catalog Promotion Test',
        designStatus: 'rendered',
      });
      writeFileSync(PAGES_YAML_PATH, stringify(pages));
    }
  }
});

test.afterAll(async () => {
  if (existsSync(SPEC_PATH)) unlinkSync(SPEC_PATH);
  if (originalPagesYaml) {
    writeFileSync(PAGES_YAML_PATH, originalPagesYaml);
  }
});

test.describe('Catalog promotion rendering', () => {
  test('promoted Section renders semantic <section> with heading', async ({ page }) => {
    const studio = new DesignStudioPO(page);
    await studio.navigateToPage(TEST_PAGE_ID);
    await studio.waitForRendererReady();

    const iframe = studio.rendererFrame;
    const section = iframe.locator('section').first();
    await expect(section).toBeVisible();

    const heading = section.locator('h2');
    await expect(heading).toHaveText('Profile Information');
  });

  test('promoted Form renders semantic <form>', async ({ page }) => {
    const studio = new DesignStudioPO(page);
    await studio.navigateToPage(TEST_PAGE_ID);
    await studio.waitForRendererReady();

    const iframe = studio.rendererFrame;
    const form = iframe.locator('form').first();
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute('role', 'form');
  });

  test('promoted PageHeader renders with banner role', async ({ page }) => {
    const studio = new DesignStudioPO(page);
    await studio.navigateToPage(TEST_PAGE_ID);
    await studio.waitForRendererReady();

    const iframe = studio.rendererFrame;
    const header = iframe.locator('[role="banner"]');
    await expect(header).toBeVisible();
  });

  test('promoted Footer renders semantic <footer>', async ({ page }) => {
    const studio = new DesignStudioPO(page);
    await studio.navigateToPage(TEST_PAGE_ID);
    await studio.waitForRendererReady();

    const iframe = studio.rendererFrame;
    const footer = iframe.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('visual verification screenshot', async ({ page }) => {
    const studio = new DesignStudioPO(page);
    await studio.navigateToPage(TEST_PAGE_ID);
    await studio.waitForRendererReady();

    await page.screenshot({ path: 'e2e/screenshots/catalog-promotion.png' });
  });
});
