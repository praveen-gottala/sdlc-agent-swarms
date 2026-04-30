import { test, expect, PET_ROOT } from './fixtures/test-base';

const PROJECT_NAME = `E2E Test ${Date.now()}`;
const PROJECT_DESC =
  'A task management app with a dashboard, task list, task detail view, ' +
  'a notifications drawer that slides in from the right, and a confirmation ' +
  'dialog for deleting tasks.';

test.describe('Onboarding wizard', () => {
  test('should create a new project through all 5 steps', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByTestId('onboarding-name')).toBeVisible({ timeout: 10_000 });

    await page.getByTestId('onboarding-name').fill(PROJECT_NAME);
    await page.getByTestId('onboarding-desc').fill(PROJECT_DESC);
    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('onboarding-use-defaults').click({ timeout: 10_000 });
    const iframe = page.locator('iframe').first();
    await iframe.waitFor({ state: 'attached', timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await page.evaluate(() => {
      window.postMessage({
        source: 'agentforge-design-preview',
        type: 'design-option-selected',
        optionIndex: 0,
      }, window.location.origin);
    });
    await expect(page.locator('text=Selected:')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('onboarding-audience').fill('internal employees');
    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('onboarding-create').click();

    await page.waitForURL(/\/spec/, { timeout: 15_000 });
  });
});

test.describe('Prototype NavigationEditor', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('should load prototype mode and show NavigationEditor panel', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });

    const protoButton = page.getByRole('button', { name: 'Prototype' });
    await expect(protoButton).toBeVisible({ timeout: 10_000 });
    await protoButton.click();

    await expect(page.locator('text=/\\d+ screens/')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Navigation' }).click();
    await expect(page.locator('text=Navigation from')).toBeVisible({ timeout: 5_000 });
  });

  test('should show mode badges on bindings and toggle between navigate/overlay', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Prototype' }).click();
    await expect(page.locator('text=/\\d+ screens/')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Navigation' }).click();
    await expect(page.locator('text=Navigation from')).toBeVisible({ timeout: 5_000 });

    const modeBadges = page.locator('button[title*="Mode:"]');
    const badgeCount = await modeBadges.count();

    if (badgeCount > 0) {
      const firstBadge = modeBadges.first();
      const initialText = await firstBadge.textContent();
      expect(['navigate', 'overlay']).toContain(initialText?.trim());

      await firstBadge.click();
      const toggledText = await firstBadge.textContent();
      expect(toggledText?.trim()).not.toBe(initialText?.trim());

      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

      await firstBadge.click();
      const restoredText = await firstBadge.textContent();
      expect(restoredText?.trim()).toBe(initialText?.trim());
    }
  });

  test('should return screen_type for all pages via navigation API', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });

    const navResponse = await page.evaluate(async () => {
      const res = await fetch('/api/navigation');
      return res.json();
    });

    const pages = navResponse.navigation as Array<{
      pageId: string;
      screen_type: string;
      navigates_to: Array<{ target: string; trigger: string }>;
    }>;

    expect(pages.length).toBeGreaterThan(0);

    for (const p of pages) {
      expect(['page', 'modal', 'drawer', 'sheet']).toContain(p.screen_type);
    }
  });
});
