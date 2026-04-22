/**
 * Phase A6 — Prototype Overlay E2E tests.
 *
 * Tests the overlay rendering system (modal, drawer, sheet) introduced in
 * Phase A4.  Exercises drawer slide-in, modal centering, Escape/backdrop
 * close, focus trapping, page-to-page regression, and binding-mode override.
 *
 * Fixture: PET (personal-expense-tracker).  Test-only overlay screens
 * (settings drawer + confirm-delete modal) are injected into pages.yaml
 * in beforeAll and cleaned up via test-base's afterAll restore.
 *
 * Run:
 *   npx playwright test e2e/prototype-overlays.spec.ts
 *   npx playwright test e2e/prototype-overlays.spec.ts -g "@a6"
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Page, FrameLocator } from '@playwright/test';
import { test, expect, PET_ROOT } from './fixtures/test-base';

const PAGES_YAML = join(PET_ROOT, 'agentforge', 'spec', 'pages.yaml');

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
      // Retry — Next may be compiling.
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Renderer on :4100 not ready within ${timeoutMs}ms (last status: ${lastStatus}). `
      + 'Start the dashboard: nx serve dashboard',
  );
}

async function gotoPetPrototype(page: Page): Promise<FrameLocator> {
  await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
  await waitForRendererReady(page);
  await page.getByRole('button', { name: 'Prototype' }).click();
  await expect(page.locator('text=Prototype Mode')).toBeVisible({ timeout: 30_000 });
  return page.frameLocator('iframe').first();
}

// ---------------------------------------------------------------------------
// Fixture injection — overlay screens for PET
// ---------------------------------------------------------------------------

test.beforeAll(async () => {
  const raw = readFileSync(PAGES_YAML, 'utf-8');
  const spec = parseYaml(raw) as { pages: Array<Record<string, unknown>> };

  spec.pages.push({
    id: 'settings',
    name: 'Settings',
    description: 'User settings drawer',
    route: '/settings',
    status: 'approved',
    screen_type: 'drawer',
  });

  spec.pages.push({
    id: 'confirm-delete',
    name: 'Confirm Delete',
    description: 'Confirmation dialog for deleting expense',
    route: '/confirm-delete',
    status: 'approved',
    screen_type: 'modal',
  });

  const dashPage = spec.pages.find(
    (p) => p.id === 'dashboard',
  ) as Record<string, unknown> | undefined;
  if (dashPage) {
    const navs = (dashPage.navigates_to ?? []) as Array<Record<string, unknown>>;
    navs.push({
      target: 'settings',
      trigger: 'Open settings drawer',
      source_node: 'topbar-logo',
    });
    dashPage.navigates_to = navs;
  }

  writeFileSync(PAGES_YAML, stringifyYaml(spec));
});

// afterAll: pages.yaml is restored by test-base. The design spec fixture
// files (settings.json, confirm-delete.json) are committed and persist.

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Prototype Overlays — Phase A6 @a6', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('drawer screen shows [drawer] badge in ScreenSelectorBar @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);
    const settingsBtn = iframe.getByRole('button', { name: /Settings \[drawer\]/ });
    await expect(settingsBtn).toBeVisible({ timeout: 15_000 });
  });

  test('modal screen shows [modal] badge in ScreenSelectorBar @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);
    const modalBtn = iframe.getByRole('button', { name: /Confirm Delete \[modal\]/ });
    await expect(modalBtn).toBeVisible({ timeout: 15_000 });
  });

  test('clicking overlay hotspot opens drawer with slide-in @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);

    const hotspot = iframe.locator('[data-nav-target="settings"][data-nav-mode="overlay"]');
    await expect(hotspot).toBeVisible({ timeout: 15_000 });
    await hotspot.click();

    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveClass(/overlay-drawer/);

    const settingsTitle = iframe.locator('dialog [data-node="settings-title"]');
    await expect(settingsTitle).toBeVisible();
  });

  test('Escape closes drawer and previous page remains visible @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);

    const hotspot = iframe.locator('[data-nav-target="settings"][data-nav-mode="overlay"]');
    await expect(hotspot).toBeVisible({ timeout: 15_000 });
    await hotspot.click();

    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    const dashMarker = iframe.locator('[data-screen-marker="dashboard"]');
    await expect(dashMarker).toBeVisible();
  });

  test('backdrop click closes drawer @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);

    const hotspot = iframe.locator('[data-nav-target="settings"][data-nav-mode="overlay"]');
    await expect(hotspot).toBeVisible({ timeout: 15_000 });
    await hotspot.click();

    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Click the far-left edge of the dialog (backdrop area, outside the drawer content).
    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).toBeTruthy();
    await dialog.click({ position: { x: 5, y: dialogBox!.height / 2 } });
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('modal opened from ScreenSelectorBar traps focus @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);

    const modalBtn = iframe.getByRole('button', { name: /Confirm Delete \[modal\]/ });
    await expect(modalBtn).toBeVisible({ timeout: 15_000 });
    await modalBtn.click();

    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toHaveClass(/overlay-modal/);

    const closeBtn = iframe.locator('dialog .overlay-close');
    await expect(closeBtn).toBeVisible();

    // Tab should cycle within the dialog, never leaving it.
    await page.keyboard.press('Tab');
    const focusedInDialog = await iframe.locator('dialog :focus').count();
    expect(focusedInDialog).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('page-to-page navigation works without overlay (regression) @a6', async ({ page }) => {
    const iframe = await gotoPetPrototype(page);

    // Navigate via ScreenSelectorBar to Add Expense (a page-type screen).
    // Use .last() to avoid the chrome "+ Add Expense" button.
    const addBtn = iframe.getByRole('button', { name: /Add Expense/ }).last();
    await expect(addBtn).toBeVisible({ timeout: 15_000 });
    await addBtn.click();

    const addMarker = iframe.locator('[data-screen-marker="add-expense"]');
    await expect(addMarker).toBeVisible({ timeout: 10_000 });

    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeHidden();
  });

  test('binding mode=navigate overrides target screenType=drawer (full-page replacement) @a6', async ({
    page,
  }) => {
    // Rewrite the settings binding to explicit mode=navigate.
    const raw = readFileSync(PAGES_YAML, 'utf-8');
    const spec = parseYaml(raw) as { pages: Array<Record<string, unknown>> };
    const dashPage = spec.pages.find((p) => p.id === 'dashboard') as Record<string, unknown>;
    const navs = dashPage.navigates_to as Array<Record<string, unknown>>;
    const settingsBinding = navs.find(
      (n) => n.target === 'settings' && n.source_node === 'topbar-logo',
    );
    if (settingsBinding) {
      settingsBinding.mode = 'navigate';
    }
    writeFileSync(PAGES_YAML, stringifyYaml(spec));

    const iframe = await gotoPetPrototype(page);

    // The hotspot should now have data-nav-mode="navigate" (not overlay).
    const hotspot = iframe.locator('[data-nav-target="settings"][data-nav-mode="navigate"]');
    await expect(hotspot).toBeVisible({ timeout: 15_000 });
    await hotspot.click();

    // Full-page replacement — no dialog, settings content in the main area.
    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeHidden({ timeout: 3_000 });

    const screenMarker = iframe.locator('[data-screen-marker="settings"]');
    await expect(screenMarker).toBeVisible({ timeout: 10_000 });
  });
});
