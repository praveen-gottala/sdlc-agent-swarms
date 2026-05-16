/**
 * E2E test: Delta Preview in Design Studio.
 *
 * Verifies the ?delta=fixture:cashpulse-add-recurring query parameter
 * renders delta highlights correctly and non-delta mode is unaffected.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';

test.describe('Delta Preview', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('delta mode renders highlights with correct classifications', async ({ page }) => {
    await page.goto('/design?page=dashboard&delta=fixture:cashpulse-add-recurring');

    const frame = page.frameLocator('iframe[src*="4100"]');
    await expect(frame.locator('[data-node="root"]')).toBeVisible({ timeout: 15000 });
    await expect(frame.locator('.delta-highlight').first()).toBeVisible({ timeout: 10000 });

    // Added nodes have delta-added class and badges
    await expect(frame.locator('[data-node="recurring-section"]')).toHaveClass(/delta-added/);
    await expect(frame.locator('[data-node="recurring-item-netflix"]')).toHaveAttribute('data-delta-op', 'added');
    await expect(frame.locator('.delta-badge:has-text("Added")').first()).toBeVisible();

    // Approve/reject controls present
    expect(await frame.locator('.delta-approve-btn').count()).toBeGreaterThanOrEqual(5);
  });

  test('non-delta mode has no highlights', async ({ page }) => {
    await page.goto('/design?page=dashboard');

    const frame = page.frameLocator('iframe[src*="4100"]');
    await expect(frame.locator('[data-node="root"]')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);

    expect(await frame.locator('.delta-highlight').count()).toBe(0);
    expect(await frame.locator('.delta-badge').count()).toBe(0);
  });
});
