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
    page.once('dialog', async (dialog) => {
      await dialog.accept('E2E test page for design generation flow');
    });

    await page.getByTestId('create-page-btn').click();

    await expect(page).toHaveURL(/\/design\?page=/, { timeout: 10000 });

    const pages = await studio.getPageList();
    expect(pages.length).toBeGreaterThanOrEqual(4);
  });

  test('selecting a draft page shows "Generate design" CTA', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      await dialog.accept(`Draft test ${Date.now()}`);
    });
    await page.getByTestId('create-page-btn').click();
    await expect(page).toHaveURL(/\/design\?page=/, { timeout: 10000 });

    const generateBtn = page.getByRole('button', { name: 'Generate design' });
    await expect(generateBtn).toBeVisible({ timeout: 5000 });
  });

  test('clicking Generate design shows pipeline choice modal', async ({ page }) => {
    page.once('dialog', async (dialog) => {
      await dialog.accept(`Pipeline test ${Date.now()}`);
    });
    await page.getByTestId('create-page-btn').click();
    await expect(page).toHaveURL(/\/design\?page=/, { timeout: 10000 });

    await page.getByRole('button', { name: 'Generate design' }).click({ timeout: 10000 });

    await expect(page.getByText('Quick Generate')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Full Pipeline')).toBeVisible();
    await expect(page.getByText('Single LLM call for fast results')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Quick Generate')).not.toBeVisible();
  });

  test('rendered page (dashboard) loads canvas with action bar', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    await expect(page.getByRole('button', { name: 'Regenerate' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('approve-btn')).toBeVisible();

    await expect(page.getByRole('button', { name: /Submit feedback|Correcting/ })).toBeVisible();
  });
});
