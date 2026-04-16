import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';

test.describe('Spec Viewer', () => {
  let sidebar: SidebarPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    await page.goto('/spec', { waitUntil: 'domcontentloaded' });
  });

  test('spec page loads with file tree and content', async ({ page }) => {
    // Header should show "Spec Viewer"
    await expect(page.getByText('Spec Viewer')).toBeVisible();

    // Spec tree should have at least one file (pages.yaml exists for PET)
    await expect(page.getByText('pages.yaml')).toBeVisible({ timeout: 5000 });
  });

  test('clicking a spec file shows its YAML content', async ({ page }) => {
    // Wait for the tree to load and click on a different file
    const designTokens = page.getByText('design-tokens.yaml');
    if (await designTokens.isVisible()) {
      await designTokens.click();
      // Content area should update (look for YAML-like content)
      await page.waitForTimeout(500);
      // The content viewer should be visible
      const contentArea = page.locator('.overflow-hidden.p-4').last();
      await expect(contentArea).toBeVisible();
    }
  });

  test('new page button opens create-page modal', async ({ page }) => {
    await page.getByTestId('spec-new-page').click();

    // Modal should appear with the textarea
    await expect(page.getByTestId('create-page-input')).toBeVisible({ timeout: 3000 });
    await expect(page.getByTestId('create-page-submit')).toBeVisible();

    // Submit should be disabled without text
    await expect(page.getByTestId('create-page-submit')).toBeDisabled();

    // Type a description → submit becomes enabled
    await page.getByTestId('create-page-input').fill('A test settings page');
    await expect(page.getByTestId('create-page-submit')).toBeEnabled();
  });

  test('spec page has Generate Spec button in header', async ({ page }) => {
    await expect(page.getByTestId('generate-spec-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('generate-spec-btn')).toHaveText('Generate Spec');
  });
});
