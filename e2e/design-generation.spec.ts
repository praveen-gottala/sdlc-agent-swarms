import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Generation', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 10000 });
  });

  test('can create a new page from Design Studio', async ({ page }) => {
    // Click "+ New page" button — this triggers window.prompt in the real code
    // For E2E, we need to handle the dialog
    page.once('dialog', async (dialog) => {
      await dialog.accept('A user settings page for profile and preferences');
    });

    await page.getByTestId('create-page-btn').click();

    // After creation, the URL should update with the new page ID
    await expect(page).toHaveURL(/\/design\?page=/, { timeout: 10000 });

    // The new page should appear in the page list
    const pages = await studio.getPageList();
    expect(pages.length).toBeGreaterThanOrEqual(4); // 3 original + at least 1 new
  });

  test('selecting a draft page shows "Generate design" CTA', async ({ page }) => {
    // add-expense page has no designStatus set (defaults to draft)
    await studio.selectPage('add-expense');
    await expect(page).toHaveURL(/\/design\?page=add-expense/, { timeout: 5000 });

    const generateBtn = page.getByRole('button', { name: 'Generate design' });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking Generate design shows pipeline choice modal', async ({ page }) => {
    await studio.selectPage('add-expense');
    await expect(page).toHaveURL(/\/design\?page=add-expense/, { timeout: 5000 });

    // Click "Generate design"
    await page.getByRole('button', { name: 'Generate design' }).click();

    // The pipeline choice modal should appear
    await expect(page.getByText('Quick Generate')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Full Pipeline')).toBeVisible();
    await expect(page.getByText('Single LLM call for fast results')).toBeVisible();

    // Cancel the modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Quick Generate')).not.toBeVisible();
  });

  test('rendered page (dashboard) loads canvas with action bar', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    // The action bar should show Regenerate and Approve buttons
    await expect(page.getByRole('button', { name: 'Regenerate' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('approve-btn')).toBeVisible();

    // Submit feedback button should be visible
    await expect(page.getByRole('button', { name: /Submit feedback|Correcting/ })).toBeVisible();
  });
});
