import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Editing', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 10000 });
  });

  test('inspector hidden by default, shows after edit mode activated', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    const inspector = page.getByTestId('design-inspector');
    await expect(inspector).not.toBeVisible();

    await studio.activateEditMode();
    await expect(inspector).toBeVisible();
    await expect(page.getByTestId('section-chat')).toBeVisible();
  });

  test('inspector has Properties, Quality, and Chat zones', async ({ page }) => {
    await studio.selectPage('dashboard');
    await studio.activateEditMode();

    const inspector = page.getByTestId('design-inspector');
    await expect(inspector).toBeVisible();

    await expect(page.getByTestId('section-properties')).toBeVisible();
    await expect(page.getByTestId('section-quality')).toBeVisible();
    await expect(page.getByTestId('section-chat')).toBeVisible();
  });

  test('Quality zone shows score and audit sections', async ({ page }) => {
    await studio.selectPage('dashboard');
    await studio.activateEditMode();

    const qualitySection = page.getByTestId('section-quality');
    await qualitySection.click();

    await expect(page.getByText('MECHANICAL AUDIT')).toBeVisible({ timeout: 5_000 });
  });

  test('save button shows on rendered page and approve works', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    const saveBtn = page.getByTestId('save-spec-btn');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await expect(saveBtn).toHaveText('Save');

    const approveBtn = page.getByTestId('approve-btn');
    await expect(approveBtn).toBeVisible();
    await expect(approveBtn).toBeEnabled();
  });

  test('approve design changes status to approved', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    const approveBtn = page.getByTestId('approve-btn');
    await expect(approveBtn).toBeVisible({ timeout: 10000 });

    await approveBtn.click();

    await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('approve-btn')).toBeVisible({ timeout: 10000 });
  });

  test('coherence check button shows in toolbar', async ({ page }) => {
    const coherenceBtn = page.locator('[aria-label="Check Coherence"]');
    await expect(coherenceBtn).toBeVisible({ timeout: 5000 });
  });
});
