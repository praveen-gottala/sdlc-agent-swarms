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
    await page.goto('/');
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 10000 });
    // Navigate to Design Studio
    await sidebar.clickNavItem('Design Studio');
    await page.waitForURL('**/design**', { timeout: 5000 });
    // Wait for pages API to finish loading (page registry buttons appear)
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 10000 });
  });

  test('page registry lists pages for personal-expense-tracker', async () => {
    const pages = await studio.getPageList();
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages).toContain('dashboard');
  });

  test('clicking a page selects it and updates URL', async ({ page }) => {
    await studio.selectPage('dashboard');
    // URL should contain the page query param
    await page.waitForURL('**/design?page=dashboard', { timeout: 5000 });
    expect(page.url()).toContain('page=dashboard');
  });

  test('rendered page (dashboard) auto-starts renderer and shows iframe', async ({ page }) => {
    await studio.selectPage('dashboard');
    await page.waitForURL('**/design?page=dashboard', { timeout: 5000 });

    // The dashboard auto-starts the Vite renderer via /api/renderer/start
    // and polls until ready — iframe should appear within ~30s
    await studio.waitForIframeReady();
    const state = await studio.getCanvasState();
    expect(state).toBe('iframe');
  });

  test('non-rendered page shows generate design CTA', async ({ page }) => {
    await studio.selectPage('add-expense');
    await page.waitForURL('**/design?page=add-expense', { timeout: 5000 });

    // Should show "Generate design" button (no iframe)
    const generateBtn = page.getByRole('button', { name: 'Generate design' });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('new page button is visible', async ({ page }) => {
    const btn = page.getByTestId('create-page-btn');
    await expect(btn).toBeVisible();
  });
});
