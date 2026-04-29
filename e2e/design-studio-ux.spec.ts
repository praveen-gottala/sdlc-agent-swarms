import { test, expect, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';

/**
 * E2E tests for the Design Studio UX overhaul (Phase 4.2).
 * Each test covers a distinct user flow with multiple assertions.
 */
test.describe('Design Studio UX Overhaul', () => {
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    studio = new DesignStudioPO(page);
  });

  test('page search filter works end-to-end', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });

    const searchInput = page.getByPlaceholder('Filter screens...');
    await expect(searchInput).toBeVisible();

    const totalBefore = await page.locator('[data-testid^="page-"]').count();
    expect(totalBefore).toBeGreaterThan(3);

    // Filter reduces count
    await searchInput.fill('Dashboard');
    await page.waitForTimeout(300);
    const filtered = await page.locator('[data-testid^="page-"]').count();
    expect(filtered).toBeLessThan(totalBefore);
    expect(filtered).toBeGreaterThanOrEqual(1);

    // Clear restores all
    await searchInput.fill('');
    await page.waitForTimeout(300);
    expect(await page.locator('[data-testid^="page-"]').count()).toBe(totalBefore);
  });

  test('edit mode gates inspector visibility and toggles', async ({ page }) => {
    await page.goto('/design?page=dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('RENDERED')).toBeVisible({ timeout: 20000 });

    // Inspector hidden by default — canvas gets full width
    await expect(page.getByTestId('design-inspector')).not.toBeVisible();

    // Wait for spec to load, then open inspector
    const editBtn = page.locator('[aria-label="Edit"]');
    await expect(async () => {
      const disabled = await editBtn.getAttribute('data-disabled');
      expect(disabled).not.toBe('true');
    }).toPass({ timeout: 20000 });

    await editBtn.click();

    // All three zones appear
    await expect(page.getByTestId('design-inspector')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('section-properties')).toBeVisible();
    await expect(page.getByTestId('section-quality')).toBeVisible();
    await expect(page.getByTestId('section-chat')).toBeVisible();

    // Toggle off — inspector hides, canvas reclaims space
    await editBtn.click();
    await expect(page.getByTestId('design-inspector')).not.toBeVisible({ timeout: 5000 });
  });

  test('edit button disabled without page selection', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });

    // Mantine ActionIcon uses data-disabled, not native disabled
    const editBtn = page.locator('[aria-label="Edit"]');
    await expect(editBtn).toHaveAttribute('data-disabled', 'true', { timeout: 5000 });
  });

  test('generate picker shows page checkboxes with redesign labels', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });

    await page.locator('[aria-label="Generate"]').click();

    // Popover with checkboxes
    await expect(page.getByText('Select pages to generate')).toBeVisible({ timeout: 5000 });
    const checkboxes = page.locator('input[type="checkbox"]');
    expect(await checkboxes.count()).toBeGreaterThan(0);

    // Selection count and action button
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate \(\d+\)/ })).toBeVisible();

    // Already-designed pages marked as redesign
    await expect(page.getByText('(redesign)').first()).toBeVisible();
  });
});
