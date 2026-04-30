/**
 * Comprehensive prototype E2E tests — chrome regions, navigation, re-entry,
 * content rendering, and design-to-prototype fidelity.
 *
 * Uses the PET (Personal Expense Tracker) fixture as reference.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { FrameLocator, Page } from '@playwright/test';
import { test, expect, PET_ROOT } from './fixtures/test-base';

const AGENTFORGE_DIR = join(PET_ROOT, 'agentforge');
const SHARED_CHROME_PATH = join(AGENTFORGE_DIR, 'shared-chrome.json');

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
    } catch { /* retry */ }
    await page.waitForTimeout(500);
  }
  throw new Error(`Renderer not ready within ${timeoutMs}ms (last: ${lastStatus}).`);
}

async function enterPrototype(page: Page): Promise<FrameLocator> {
  await page.getByRole('button', { name: 'Prototype' }).click();
  await expect(page.locator('text=/\\d+ screens/')).toBeVisible({ timeout: 30_000 });
  const frame = page.frameLocator('iframe').first();
  await expect(frame.locator('[data-persistent="header"]')).toBeVisible({ timeout: 15_000 });
  return frame;
}

// ---------------------------------------------------------------------------
// Spec-level assertions (no browser needed)
// ---------------------------------------------------------------------------

test.describe('Chrome region spec contract', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('shared-chrome.json has NavigationTabs in header, not footer', async () => {
    if (!existsSync(SHARED_CHROME_PATH)) test.skip(true, 'no shared-chrome.json');
    const chrome = JSON.parse(readFileSync(SHARED_CHROME_PATH, 'utf-8')) as {
      regions: Record<string, string[]>;
    };
    expect(chrome.regions.header?.some((id) => /nav-?tabs?/i.test(id))).toBe(true);
    expect(chrome.regions.footer?.some((id) => /nav-?tabs?/i.test(id)) ?? false).toBe(false);
  });

  test('shared-chrome.json tab nodes have navigateTo', async () => {
    if (!existsSync(SHARED_CHROME_PATH)) test.skip(true, 'no shared-chrome.json');
    const chrome = JSON.parse(readFileSync(SHARED_CHROME_PATH, 'utf-8')) as {
      nodes: Record<string, { parent?: string; navigateTo?: string }>;
    };
    const tabContainer = Object.entries(chrome.nodes).find(
      ([id]) => /nav-?tabs?$/i.test(id),
    );
    if (!tabContainer) test.skip(true, 'no nav-tabs node');

    const tabChildren = Object.entries(chrome.nodes).filter(
      ([, n]) => n.parent === tabContainer![0],
    );
    const withNav = tabChildren.filter(([, n]) => n.navigateTo);
    expect(withNav.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Active tab state (catches the /-tab$/i regex bug)
// ---------------------------------------------------------------------------

test.describe('Active tab state', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
  });

  test('Dashboard tab is visually active on load', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const dashTab = header.locator('[data-nav-target="dashboard"]').first();
    if ((await dashTab.count()) === 0) test.skip(true, 'no dashboard nav target');

    const style = await dashTab.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { fontWeight: parseInt(s.fontWeight, 10), borderBottom: s.borderBottomColor };
    });
    const isActive = style.fontWeight >= 600 || (style.borderBottom !== 'transparent' && style.borderBottom !== 'rgba(0, 0, 0, 0)');
    expect(isActive).toBe(true);
  });

  test('Insights tab becomes active after navigation', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const insightsNav = header.locator('[data-nav-target="spending-insights"]').first();
    if ((await insightsNav.count()) === 0) test.skip(true, 'no insights nav target');

    await insightsNav.click();
    await page.waitForTimeout(500);

    const insightsStyle = await insightsNav.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { fontWeight: parseInt(s.fontWeight, 10), borderBottom: s.borderBottomColor };
    });
    const isInsightsActive = insightsStyle.fontWeight >= 600 || (insightsStyle.borderBottom !== 'transparent' && insightsStyle.borderBottom !== 'rgba(0, 0, 0, 0)');
    expect(isInsightsActive).toBe(true);

    const dashTab = header.locator('[data-nav-target="dashboard"]').first();
    if ((await dashTab.count()) > 0) {
      const dashStyle = await dashTab.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return { fontWeight: parseInt(s.fontWeight, 10) };
      });
      expect(dashStyle.fontWeight).toBeLessThan(600);
    }
  });

  test('active indicator round-trips correctly (Dashboard → Insights → Dashboard)', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const dashNav = header.locator('[data-nav-target="dashboard"]').first();
    const insightsNav = header.locator('[data-nav-target="spending-insights"]').first();
    if ((await dashNav.count()) === 0 || (await insightsNav.count()) === 0) {
      test.skip(true, 'missing nav targets');
    }

    await insightsNav.click();
    await page.waitForTimeout(500);
    await dashNav.click();
    await page.waitForTimeout(500);

    const dashStyle = await dashNav.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { fontWeight: parseInt(s.fontWeight, 10), borderBottom: s.borderBottomColor };
    });
    const isDashActive = dashStyle.fontWeight >= 600 || (dashStyle.borderBottom !== 'transparent' && dashStyle.borderBottom !== 'rgba(0, 0, 0, 0)');
    expect(isDashActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prototype rendering — chrome layout
// ---------------------------------------------------------------------------

test.describe('Chrome region rendering', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
  });

  test('header renders above content with no spacer gap', async ({ page }) => {
    const frame = await enterPrototype(page);
    const headerBox = await frame.locator('[data-persistent="header"]').boundingBox();
    const contentBox = await frame.locator('[data-persistent="content"]').boundingBox();
    expect(headerBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(contentBox!.y + 2);
  });

  test('no footer region when all chrome is header (desktop layout)', async ({ page }) => {
    if (!existsSync(SHARED_CHROME_PATH)) test.skip(true, 'no shared-chrome.json');
    const chrome = JSON.parse(readFileSync(SHARED_CHROME_PATH, 'utf-8')) as {
      regions: Record<string, string[]>;
    };
    if (chrome.regions.footer?.length) test.skip(true, 'fixture has footer');

    const frame = await enterPrototype(page);
    await expect(frame.locator('[data-persistent="footer"]')).toHaveCount(0);
  });

  test('NavigationTabs text appears in header near top of viewport', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    for (const tabText of ['Dashboard', 'Insights', 'Add Expense']) {
      const tab = header.getByText(tabText, { exact: true }).first();
      if ((await tab.count()) > 0) {
        const box = await tab.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.y).toBeLessThan(250);
        return;
      }
    }
  });

  test('content has no root-level spacer nodes (stripped in LayoutShell mode)', async ({ page }) => {
    const frame = await enterPrototype(page);
    const spacers = await frame.locator('[data-persistent="content"] [data-node*="spacer"]').count();
    expect(spacers).toBe(0);
  });

  test('content root is not styled as page (no 100vh min-height)', async ({ page }) => {
    const frame = await enterPrototype(page);
    const content = frame.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 10_000 });
    const minHeight = await content.evaluate((el) => window.getComputedStyle(el).minHeight);
    expect(minHeight).not.toBe('100vh');
  });
});

// ---------------------------------------------------------------------------
// Prototype navigation — chrome tab clicks
// ---------------------------------------------------------------------------

test.describe('Chrome tab navigation', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
  });

  test('chrome tabs have navigation hotspots', async ({ page }) => {
    const frame = await enterPrototype(page);
    const hotspots = await frame.locator('[data-persistent="header"] [data-nav-target]').count();
    expect(hotspots).toBeGreaterThanOrEqual(2);
  });

  test('clicking Insights tab navigates to spending-insights screen', async ({ page }) => {
    const frame = await enterPrototype(page);
    const insightsNav = frame.locator('[data-persistent="header"] [data-nav-target="spending-insights"]').first();
    if ((await insightsNav.count()) === 0) test.skip(true, 'no insights nav target');

    await insightsNav.click();
    await page.waitForTimeout(500);
    const marker = await frame.locator('[data-persistent="content"] [data-screen-marker]').getAttribute('data-screen-marker');
    expect(marker).toBe('spending-insights');
  });

  test('full navigation cycle: Dashboard → Insights → Add Expense → Dashboard', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const contentMarker = () => frame.locator('[data-persistent="content"] [data-screen-marker]');

    const insightsNav = header.locator('[data-nav-target="spending-insights"]').first();
    const addNav = header.locator('[data-nav-target="add-expense"]').first();
    const dashNav = header.locator('[data-nav-target="dashboard"]').first();
    if ((await insightsNav.count()) === 0 || (await addNav.count()) === 0 || (await dashNav.count()) === 0) {
      test.skip(true, 'missing nav targets for full cycle');
    }

    await insightsNav.click();
    await page.waitForTimeout(500);
    expect(await contentMarker().getAttribute('data-screen-marker')).toBe('spending-insights');

    await addNav.click();
    await page.waitForTimeout(500);
    expect(await contentMarker().getAttribute('data-screen-marker')).toBe('add-expense');

    await dashNav.click();
    await page.waitForTimeout(500);
    expect(await contentMarker().getAttribute('data-screen-marker')).toBe('dashboard');
  });

  test('chrome header persists with same mountId across navigation', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const initialMountId = await header.getAttribute('data-mount-id');
    expect(initialMountId).toBeTruthy();

    const insightsNav = frame.locator('[data-persistent="header"] [data-nav-target="spending-insights"]').first();
    if ((await insightsNav.count()) === 0) test.skip(true, 'no insights nav target');
    await insightsNav.click();
    await page.waitForTimeout(300);

    expect(await header.getAttribute('data-mount-id')).toBe(initialMountId);
  });
});

// ---------------------------------------------------------------------------
// Prototype mode lifecycle — exit and re-entry
// ---------------------------------------------------------------------------

test.describe('Prototype mode lifecycle', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
  });

  test('prototype renders after exit and re-entry (no blank iframe)', async ({ page }) => {
    const frame = await enterPrototype(page);
    await expect(frame.locator('[data-persistent="header"]')).toBeVisible();

    await page.getByRole('button', { name: 'Exit Prototype' }).click();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Prototype' }).click();
    await expect(page.locator('text=/\\d+ screens/')).toBeVisible({ timeout: 30_000 });
    await expect(frame.locator('[data-persistent="header"]')).toBeVisible({ timeout: 15_000 });
  });

  test('content renders after re-entry (not just chrome)', async ({ page }) => {
    await enterPrototype(page);
    await page.getByRole('button', { name: 'Exit Prototype' }).click();
    await page.waitForTimeout(1000);

    const frame2 = await enterPrototype(page);
    const content = frame2.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 10_000 });
    const childCount = await content.locator('[data-screen-marker]').count();
    expect(childCount).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Design-to-prototype content fidelity
// ---------------------------------------------------------------------------

test.describe('Design-to-prototype fidelity', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
  });

  test('dashboard content has budget and expenses sections', async ({ page }) => {
    const frame = await enterPrototype(page);
    const content = frame.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 10_000 });

    const hasAmount = content.getByText('$2,847').first();
    const hasExpenses = content.getByText('Recent Expenses').first();
    await expect(hasAmount).toBeVisible({ timeout: 5_000 });
    await expect(hasExpenses).toBeVisible({ timeout: 5_000 });
  });

  test('Spending Insights page has stats and categories', async ({ page }) => {
    const frame = await enterPrototype(page);
    const insightsNav = frame.locator('[data-persistent="header"] [data-nav-target="spending-insights"]').first();
    if ((await insightsNav.count()) === 0) test.skip(true, 'no insights nav target');

    await insightsNav.click();
    await page.waitForTimeout(500);
    const content = frame.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 10_000 });

    const hasTotalSpent = content.getByText('Total Spent').first();
    const hasCategories = content.getByText('Top Categories').first();
    const totalSpentVisible = (await hasTotalSpent.count()) > 0;
    const categoriesVisible = (await hasCategories.count()) > 0;
    expect(totalSpentVisible || categoriesVisible).toBe(true);
  });

  test('Add Expense page has form content', async ({ page }) => {
    const frame = await enterPrototype(page);
    const addNav = frame.locator('[data-persistent="header"] [data-nav-target="add-expense"]').first();
    if ((await addNav.count()) === 0) test.skip(true, 'no add-expense nav target');

    await addNav.click();
    await page.waitForTimeout(500);
    const content = frame.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 10_000 });

    const nodeCount = await content.locator('[data-node]').count();
    expect(nodeCount).toBeGreaterThanOrEqual(3);
  });

  test('every page has at least 5 content nodes', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    const content = frame.locator('[data-persistent="content"]');

    const navTargets = await header.locator('[data-nav-target]').all();
    for (const nav of navTargets) {
      await nav.click();
      await page.waitForTimeout(500);
      await expect(content).toBeVisible({ timeout: 10_000 });
      const nodeCount = await content.locator('[data-node]').count();
      const target = await nav.getAttribute('data-nav-target');
      expect(nodeCount, `page "${target}" has fewer than 5 content nodes`).toBeGreaterThanOrEqual(5);
    }
  });

  test('TopBar brand name matches design spec', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    await expect(header.getByText('Budgetly')).toBeVisible();
  });

  test('month selector shows current period', async ({ page }) => {
    const frame = await enterPrototype(page);
    const header = frame.locator('[data-persistent="header"]');
    await expect(header.getByText('June 2025')).toBeVisible();
  });

  test('category breakdown section renders in dashboard', async ({ page }) => {
    const frame = await enterPrototype(page);
    const content = frame.locator('[data-persistent="content"]');
    const categoryText = content.getByText('Spending by Category').first();
    if ((await categoryText.count()) === 0) {
      const altText = content.getByText('Category').first();
      expect(await altText.count()).toBeGreaterThanOrEqual(1);
      return;
    }
    await expect(categoryText).toBeVisible();
  });
});
