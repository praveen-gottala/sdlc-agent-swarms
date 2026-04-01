import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';

test.describe('Project Switching', () => {
  let sidebar: SidebarPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 10000 });
  });

  test('active project name shows in sidebar', async () => {
    const name = await sidebar.getProjectName();
    // personal-expense-tracker's agentforge.yaml should have the project name
    expect(name).toBeTruthy();
  });

  test('project switcher dropdown lists discovered projects', async ({ page }) => {
    await sidebar.openProjectSwitcher();
    // Wait for dropdown to appear
    const dropdown = page.locator('[data-testid^="project-option-"]');
    await expect(dropdown.first()).toBeVisible({ timeout: 5000 });

    const count = await dropdown.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('switching to another project reloads the page', async ({ page }) => {
    await sidebar.openProjectSwitcher();

    // Find a project option that is NOT the current active one (not highlighted)
    const options = page.locator('[data-testid^="project-option-"]');
    const count = await options.count();

    if (count < 2) {
      test.skip(true, 'Only one project available — cannot test switching');
      return;
    }

    // Get current project name
    const currentName = await sidebar.getProjectName();

    // Click the first non-active project option and wait for navigation
    for (let i = 0; i < count; i++) {
      const cls = (await options.nth(i).getAttribute('class')) ?? '';
      if (!cls.includes('bg-accent-blue')) {
        // Wait for the page to reload after clicking
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
          options.nth(i).click(),
        ]);
        break;
      }
    }

    // After reload, wait for shell to hydrate
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 15000 });

    // Project name should have changed
    const newName = await sidebar.getProjectName();
    expect(newName).not.toBe(currentName);
  });
});
