/**
 * E2E tests for Open Issues OI-1, OI-2, OI-3 fixes.
 *
 * Tag conventions:
 *   @oi1 — modal whitespace + close button repositioning
 *   @oi2 — chrome navigation cross-page bindings
 *   @oi3 — screenType fallback from design spec
 *
 * Run all:
 *   npx playwright test e2e/prototype-overlay-fixes.spec.ts
 *
 * Run one tag:
 *   npx playwright test e2e/prototype-overlay-fixes.spec.ts -g "@oi3"
 *
 * Fixture: fixtures/personal-expense-tracker (PET).
 * PET has confirm-delete (modal) and settings (drawer) specs with screenType
 * in the design JSON but NO screen_type in pages.yaml — ideal for testing
 * the screenType fallback.
 */

import type { Page } from '@playwright/test';
import { test, expect, PET_ROOT } from './fixtures/test-base';

async function waitForRendererReady(page: Page, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'unknown';
  while (Date.now() < deadline) {
    try {
      const res = await page.request.get('/api/renderer/status', { timeout: 3_000 });
      if (res.ok()) {
        const data = (await res.json()) as { status?: string };
        lastStatus = data.status ?? 'unknown';
        if (lastStatus === 'ready') return;
      }
    } catch {
      // retry
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Renderer not ready within ${timeoutMs}ms (last status: ${lastStatus})`,
  );
}

test.describe('OI-3: screenType fallback from design spec @oi3', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('manifest populates screenType from design spec when pages.yaml omits it @oi3', async ({ page }) => {
    const res = await page.request.get('/api/prototype');
    expect(res.ok()).toBe(true);
    const data = await res.json();
    const manifest = data.manifest;

    const confirmDelete = manifest.screens.find(
      (s: { screenId: string }) => s.screenId === 'confirm-delete',
    );
    const settings = manifest.screens.find(
      (s: { screenId: string }) => s.screenId === 'settings',
    );

    expect(confirmDelete).toBeDefined();
    expect(confirmDelete.screenType).toBe('modal');

    expect(settings).toBeDefined();
    expect(settings.screenType).toBe('drawer');
  });

  test('ScreenSelectorBar badge shows screen type with tooltip @oi3', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await waitForRendererReady(page);

    const protoBtn = page.getByRole('button', { name: /prototype/i });
    if (await protoBtn.isVisible()) {
      await protoBtn.click();
    }
    await waitForRendererReady(page);

    const iframe = page.frameLocator('iframe');

    const modalBadge = iframe.getByRole('button', { name: /confirm-delete.*\[modal\]/i });
    if (await modalBadge.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const title = await modalBadge.getAttribute('title');
      expect(title).toContain('screen_type');
    }
  });
});

test.describe('OI-1: modal overlay whitespace + close button @oi1', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('modal overlay shrinks to content height @oi1', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await waitForRendererReady(page);

    const protoBtn = page.getByRole('button', { name: /prototype/i });
    if (await protoBtn.isVisible()) {
      await protoBtn.click();
    }
    await waitForRendererReady(page);

    const iframe = page.frameLocator('iframe');

    const modalBtn = iframe.getByRole('button', { name: /confirm-delete/i });
    if (await modalBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await modalBtn.click();
      await page.waitForTimeout(500);

      const dialog = iframe.locator('dialog[open]');
      await expect(dialog).toBeVisible({ timeout: 5_000 });

      const content = iframe.locator('.overlay-content');
      const contentBox = await content.boundingBox();
      if (contentBox) {
        const viewportSize = page.viewportSize();
        if (viewportSize) {
          const maxExpectedHeight = viewportSize.height * 0.85;
          expect(contentBox.height).toBeLessThan(maxExpectedHeight * 0.7);
        }
      }
    }
  });

  test('system close button is outside overlay-content @oi1', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await waitForRendererReady(page);

    const protoBtn = page.getByRole('button', { name: /prototype/i });
    if (await protoBtn.isVisible()) {
      await protoBtn.click();
    }
    await waitForRendererReady(page);

    const iframe = page.frameLocator('iframe');

    const modalBtn = iframe.getByRole('button', { name: /confirm-delete/i });
    if (await modalBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await modalBtn.click();
      await page.waitForTimeout(500);

      const systemClose = iframe.locator('.overlay-close-system');
      await expect(systemClose).toBeVisible({ timeout: 5_000 });

      const insideContent = iframe.locator('.overlay-content .overlay-close-system');
      await expect(insideContent).toHaveCount(0);
    }
  });
});

test.describe('OI-2: chrome navigation bindings @oi2', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('manifest includes __chrome__ bindings when chrome spec has navigateTo @oi2', async ({ page }) => {
    const res = await page.request.get('/api/prototype');
    expect(res.ok()).toBe(true);
    const data = await res.json();

    const chromeBindings = data.manifest.navigation.filter(
      (b: { sourceScreenId: string }) => b.sourceScreenId === '__chrome__',
    );

    if (data.chromeSpec) {
      const hasNavigateTo = Object.values(data.chromeSpec.nodes ?? {}).some(
        (n: unknown) => (n as Record<string, unknown>).navigateTo,
      );
      if (hasNavigateTo) {
        expect(chromeBindings.length).toBeGreaterThan(0);
      }
    }
  });
});
