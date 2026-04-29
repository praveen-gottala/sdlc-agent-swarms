import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';

test.describe('Project Switching', () => {
  let sidebar: SidebarPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="sidebar-toggle"]', { timeout: 10000 });
  });

  test('active project name shows in sidebar', async () => {
    const name = await sidebar.getProjectName();
    expect(name).toBeTruthy();
  });

  test('project switcher dropdown lists discovered projects', async ({ page }) => {
    await sidebar.openProjectSwitcher();
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible({ timeout: 5000 });

    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('switching to another project updates the sidebar', async ({ page }) => {
    await sidebar.openProjectSwitcher();

    const options = page.getByRole('option');
    const count = await options.count();

    if (count < 2) {
      test.skip(true, 'Only one project available — cannot test switching');
      return;
    }

    const currentName = await sidebar.getProjectName();

    // Click the first option whose text differs from the current project
    for (let i = 0; i < count; i++) {
      const optionText = (await options.nth(i).textContent()) ?? '';
      if (optionText.trim() !== currentName.trim()) {
        await options.nth(i).click();
        break;
      }
    }

    // Wait for the project name to change (SPA state update via API call)
    await expect(async () => {
      const newName = await sidebar.getProjectName();
      expect(newName).not.toBe(currentName);
    }).toPass({ timeout: 15000 });
  });
});
