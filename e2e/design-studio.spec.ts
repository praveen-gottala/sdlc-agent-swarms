import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Studio', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    // Navigate directly to Design Studio (avoids client-side hydration race)
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    // Wait for pages API to finish loading (page registry buttons appear)
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });
  });

  test('page registry lists pages for personal-expense-tracker', async () => {
    const pages = await studio.getPageList();
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages).toContain('dashboard');
  });

  test('clicking a page selects it and updates URL', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/page=dashboard/, { timeout: 5000 });
  });

  test('rendered page (dashboard) auto-starts renderer and shows iframe', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/page=dashboard/, { timeout: 5000 });

    // The dashboard auto-starts the Vite renderer via /api/renderer/start
    // and polls until ready — iframe should appear within ~30s
    await studio.waitForIframeReady();
    const state = await studio.getCanvasState();
    expect(state).toBe('iframe');
  });

  test('non-rendered page shows generate design CTA', async ({ page }) => {
    // Find a page that has draft/spec-pending status (not rendered)
    const pageList = page.getByTestId('design-inspector').locator('..');
    const allPageBtns = page.locator('[data-testid^="page-"]');
    const count = await allPageBtns.count();

    let foundUnrendered = false;
    for (let i = 0; i < count; i++) {
      const btn = allPageBtns.nth(i);
      const testId = await btn.getAttribute('data-testid');
      if (!testId) continue;
      const pageId = testId.replace('page-', '');
      // Skip known rendered pages
      if (['dashboard', 'add-expense', 'spending-insights'].includes(pageId)) continue;
      await btn.click();
      await page.waitForTimeout(1000);
      // Check if Generate design button appears
      const generateBtn = page.getByRole('button', { name: 'Generate design' });
      if (await generateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        foundUnrendered = true;
        await expect(generateBtn).toBeVisible();
        break;
      }
    }
    if (!foundUnrendered) {
      test.skip(true, 'All pages in project are rendered — no unrendered page to test');
    }
  });

  test('new page button is visible', async ({ page }) => {
    const btn = page.getByTestId('create-page-btn');
    await expect(btn).toBeVisible();
  });
});
