import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';

test.describe('Runs page', () => {
  let sidebar: SidebarPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    await page.goto('/pipeline');
    await page.waitForSelector('[data-testid="sidebar-toggle"]', { timeout: 10000 });
  });

  test('page heading shows Runs', async ({ page }) => {
    await expect(page.getByTestId('runs-page-heading')).toHaveText('Runs');
  });

  test('spine rail shows 4 stages', async ({ page }) => {
    const rail = page.getByTestId('spine-rail');
    await expect(rail).toBeVisible();

    await expect(rail.getByText('Clarify')).toBeVisible();
    await expect(rail.getByText('Architect')).toBeVisible();
    await expect(rail.getByText('Implement')).toBeVisible();
    await expect(rail.getByText('Review')).toBeVisible();
  });

  test('unimplemented stages show Upcoming badge', async ({ page }) => {
    const rail = page.getByTestId('spine-rail');
    const upcomingBadges = rail.getByText('Upcoming');
    await expect(upcomingBadges).toHaveCount(3);
  });

  test('emergency controls are visible', async ({ page }) => {
    await expect(page.getByTestId('pause-all-btn')).toBeVisible();
    await expect(page.getByTestId('abort-all-btn')).toBeVisible();
  });

  test('emergency controls are disabled when no active run', async ({ page }) => {
    await expect(page.getByTestId('pause-all-btn')).toBeDisabled();
    await expect(page.getByTestId('abort-all-btn')).toBeDisabled();
  });

  test('run history shows table or empty state', async ({ page }) => {
    const table = page.getByTestId('run-history-table');
    const empty = page.getByTestId('runs-empty-state');

    await expect(async () => {
      const tableVisible = await table.isVisible().catch(() => false);
      const emptyVisible = await empty.isVisible().catch(() => false);
      expect(tableVisible || emptyVisible).toBe(true);
    }).toPass({ timeout: 10000 });
  });

  test('sidebar nav item shows Runs label', async ({ page }) => {
    const navItem = page.getByTestId('nav-runs');
    await expect(navItem).toBeVisible();
    await expect(navItem).toContainText('Runs');
  });
});
