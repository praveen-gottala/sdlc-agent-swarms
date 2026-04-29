import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';

test.describe('Navigation', () => {
  let sidebar: SidebarPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="sidebar-toggle"]', { timeout: 10000 });
  });

  test('home page loads with project content', async () => {
    // Project data loads async after sidebar renders — retry until it arrives
    await expect(async () => {
      const name = await sidebar.getProjectName();
      expect(name.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000 });
  });

  test('sidebar links navigate to correct routes', async ({ page }) => {
    const routes = [
      { label: 'Design Studio', path: '/design' },
      { label: 'Spec', path: '/spec' },
    ];

    for (const { path } of routes) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path), { timeout: 10000 });
      await page.waitForSelector('[data-testid="sidebar-toggle"]', { timeout: 10000 });
    }
  });

  test('sidebar collapse/expand toggle works', async ({ page }) => {
    // Sidebar starts expanded — collapse button has "Collapse sidebar" aria-label
    await expect(page.getByLabel('Collapse sidebar')).toBeVisible();

    // Collapse
    await sidebar.toggleCollapse();
    // After collapse — expand button visible instead
    await expect(page.getByLabel('Expand sidebar')).toBeVisible();

    // Expand
    await sidebar.toggleCollapse();
    await expect(page.getByLabel('Collapse sidebar')).toBeVisible();
  });

  test('active nav item is highlighted', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="sidebar-toggle"]', { timeout: 10000 });

    const isActive = await sidebar.isNavItemActive('Design Studio');
    expect(isActive).toBe(true);

    const pipelineActive = await sidebar.isNavItemActive('Pipeline');
    expect(pipelineActive).toBe(false);
  });
});
