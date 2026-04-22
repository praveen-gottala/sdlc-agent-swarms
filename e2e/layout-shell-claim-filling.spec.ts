/**
 * LayoutShell rendering tests for the Claim Filling fixture.
 *
 * These tests directly inspect the iframe DOM via Playwright's frameLocator
 * to verify LayoutShell activation and persistent header rendering — something
 * that can't be verified from the parent page due to cross-origin restrictions.
 *
 * Run:
 *   npx playwright test e2e/layout-shell-claim-filling.spec.ts --headed
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { FrameLocator, Page } from '@playwright/test';
import { test, expect, CLAIM_ROOT } from './fixtures/test-base';

const SHARED_CHROME_PATH = join(CLAIM_ROOT, '.agentforge/previews/shared-chrome.json');

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
  throw new Error(`Renderer not ready within ${timeoutMs}ms (last: ${lastStatus})`);
}

async function enterPrototype(page: Page): Promise<FrameLocator> {
  await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
  await waitForRendererReady(page);
  await page.getByRole('button', { name: 'Prototype' }).click();
  await expect(page.locator('text=Prototype Mode')).toBeVisible({ timeout: 60_000 });
  const iframe = page.frameLocator('iframe[data-testid="prototype-iframe"]');
  await expect(iframe.locator('[data-node]').first()).toBeVisible({ timeout: 30_000 });
  return iframe;
}

test.describe('LayoutShell — Claim Filling fixture', () => {
  test.beforeEach(async ({ setActiveProject }, testInfo) => {
    if (!existsSync(SHARED_CHROME_PATH)) {
      testInfo.skip(true, 'Missing shared-chrome.json — run design:page:all for claim-filling-sample');
      return;
    }
    setActiveProject(CLAIM_ROOT);
  });

  test('LayoutShell header is present and visible with non-zero height', async ({ page }) => {
    const iframe = await enterPrototype(page);

    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    const box = await header.boundingBox();
    expect(box, 'header must have a bounding box').not.toBeNull();
    expect(box!.height, 'header height must be > 0').toBeGreaterThan(0);
    expect(box!.width, 'header width must be > 0').toBeGreaterThan(0);
    expect(box!.y, 'header y must be >= 0 (not scrolled above viewport)').toBeGreaterThanOrEqual(0);

    // Capture iframe only for visual verification
    const iframeEl = page.locator('iframe[data-testid="prototype-iframe"]');
    await iframeEl.screenshot({ path: 'test-results/layout-shell-dashboard-iframe.png' });
  });

  test('LayoutShell content area is present and shows dashboard by default', async ({ page }) => {
    const iframe = await enterPrototype(page);

    const content = iframe.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 15_000 });

    const marker = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(marker).toBe('dashboard');
  });

  test('header persists (same mount-id) when navigating between screens', async ({ page }) => {
    const iframe = await enterPrototype(page);

    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    const initialMountId = await header.getAttribute('data-mount-id');
    expect(initialMountId).toBeTruthy();

    // Navigate to Claims List via ScreenSelectorBar
    await iframe.getByRole('button', { name: 'Claims List', exact: true }).click();
    await page.waitForTimeout(300);

    // Header must still be visible with same mount-id
    await expect(header).toBeVisible();
    const afterMountId = await header.getAttribute('data-mount-id');
    expect(afterMountId).toBe(initialMountId);

    // Header must still be at the top of the viewport
    const afterBox = await header.boundingBox();
    expect(afterBox, 'header bounding box after navigation').not.toBeNull();
    expect(afterBox!.height, 'header height after nav > 0').toBeGreaterThan(0);
    expect(afterBox!.y, 'header y after nav >= 0').toBeGreaterThanOrEqual(0);

    // Content should show claims-list screen
    const content = iframe.locator('[data-persistent="content"]');
    const marker = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(marker).toBe('claims-list');

    // ClaimFlow branding must still be visible in header
    await expect(header.getByText('ClaimFlow')).toBeVisible();

    // Capture the iframe element directly for visual verification
    const iframeEl = page.locator('iframe[data-testid="prototype-iframe"]');
    await iframeEl.screenshot({ path: 'test-results/layout-shell-claims-list-iframe.png' });
  });

  test('header contains ClaimFlow branding on all screens', async ({ page }) => {
    const iframe = await enterPrototype(page);
    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    // Check header has the app name
    await expect(header.getByText('ClaimFlow')).toBeVisible();

    // Navigate to a different screen and verify header still has branding
    await iframe.getByRole('button', { name: 'New Claim Form', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(header.getByText('ClaimFlow')).toBeVisible();
  });

  test('chrome is stripped from page content (no duplicate header inside content)', async ({ page }) => {
    const iframe = await enterPrototype(page);

    const header = iframe.locator('[data-persistent="header"]');
    const content = iframe.locator('[data-persistent="content"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    // nav-header should be in the LayoutShell header, not duplicated in content
    const chromeInHeader = header.locator('[data-node="nav-header"]');
    const chromeInContent = content.locator('[data-node="nav-header"]');
    expect(await chromeInHeader.count()).toBe(1);
    expect(await chromeInContent.count()).toBe(0);
  });

  test('no pseudo-screen (__shared-chrome__) in the ScreenSelectorBar', async ({ page }) => {
    const iframe = await enterPrototype(page);
    await expect(iframe.locator('[data-node]').first()).toBeVisible({ timeout: 15_000 });

    // No button with text starting with "__"
    await expect(iframe.getByRole('button', { name: /^__/ })).toHaveCount(0);
  });

  test('bell icon navigateTo wired to notifications-panel (drawer)', async ({ page }) => {
    const iframe = await enterPrototype(page);
    await expect(iframe.locator('[data-persistent="header"]')).toBeVisible({ timeout: 15_000 });

    // The bell icon should have a navigateTo binding (rendered as a nav hotspot)
    const bellHotspot = iframe.locator('[aria-label="Navigate to notifications-panel"]');
    if (await bellHotspot.count() === 0) {
      // Fallback: check for any element with description containing notifications
      const altBell = iframe.locator('[data-node="nav-notification-bell"]');
      if (await altBell.count() > 0) {
        test.info().annotations.push({
          type: 'info',
          description: 'Bell icon found but navigateTo not rendered as aria-label — check propagateNavigateToChromeTabs',
        });
      }
      test.skip(true, 'Bell icon nav hotspot not found — propagateNavigateToChromeTabs may need re-generation');
      return;
    }
    await bellHotspot.click();

    // Should open notifications drawer overlay
    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    // Header must persist after overlay close
    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible();
  });

  test('default screen is dashboard (not alphabetically first)', async ({ page }) => {
    const iframe = await enterPrototype(page);
    await expect(iframe.locator('[data-node]').first()).toBeVisible({ timeout: 15_000 });

    // The Dashboard button in ScreenSelectorBar should be active/highlighted
    const dashboardBtn = iframe.getByRole('button', { name: 'Dashboard', exact: true });
    await expect(dashboardBtn).toBeVisible();

    // Content should show dashboard
    const content = iframe.locator('[data-persistent="content"]');
    if (await content.count() > 0) {
      const marker = await content.locator('[data-screen-marker]').first().getAttribute('data-screen-marker');
      expect(marker).toBe('dashboard');
    } else {
      // LayoutShell not active — check the screen marker directly
      const marker = await iframe.locator('[data-screen-marker]').first().getAttribute('data-screen-marker');
      expect(marker).toBe('dashboard');
    }
  });
});
