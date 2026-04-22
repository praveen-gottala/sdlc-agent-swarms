import { test, expect, type Page } from '@playwright/test';

async function waitForRendererReady(page: Page, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page.request.get('/api/renderer/status').catch(() => null);
    if (res?.ok()) {
      const json = await res.json().catch(() => null);
      if (json?.status === 'ready') return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Renderer not ready after ${timeoutMs}ms`);
}

test.describe('Design Audit @audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
  });

  test('audit button visible in toolbar', async ({ page }) => {
    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeVisible({ timeout: 10_000 });
  });

  test('audit button disabled when no design page is selected', async ({ page }) => {
    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeVisible({ timeout: 10_000 });
    // Without a rendered page selected, the button should be disabled
    await expect(auditBtn).toBeDisabled();
  });

  test('audit tab exists in inspector', async ({ page }) => {
    const auditTab = page.getByRole('tab', { name: /audit/i });
    await expect(auditTab).toBeVisible({ timeout: 10_000 });
  });

  test('audit tab shows idle message before running', async ({ page }) => {
    const auditTab = page.getByRole('tab', { name: /audit/i });
    await auditTab.click();
    await expect(page.getByText(/Click.*Audit.*toolbar/)).toBeVisible({ timeout: 5_000 });
  });

  test('mechanical audit runs and shows results on a rendered page', async ({ page }) => {
    // Wait for pages to load then click "dashboard" (known rendered page)
    await page.waitForTimeout(3000);
    const dashboardBtn = page.locator('button', { hasText: 'dashboard' }).first();
    if (await dashboardBtn.count() === 0) {
      test.skip(true, 'No "dashboard" page in the active project');
      return;
    }

    await dashboardBtn.click();
    await waitForRendererReady(page);

    // Wait for design spec to load AND the renderer iframe to be ready
    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeEnabled({ timeout: 30_000 });

    // Wait for the canvas iframe to render (bridge sends render-complete)
    await page.waitForTimeout(5000);

    await auditBtn.click();

    // Switch to Audit tab in inspector
    const auditTab = page.getByRole('tab', { name: /audit/i });
    await auditTab.click();

    // Wait for DOM extraction + API call + results render
    await expect(page.getByText('spec nodes found in DOM')).toBeVisible({ timeout: 30_000 });

    // Wait for results (not the idle message)
    await expect(page.getByText('spec nodes found in DOM')).toBeVisible({ timeout: 15_000 });

    // Take screenshot to verify
    await page.screenshot({ path: 'e2e/screenshots/audit-mechanical-results.png', fullPage: false });

    // Should show at least one verdict pill
    const passPill = page.locator('text=/\\d+ Pass/');
    const failPill = page.locator('text=/\\d+ Fail/');
    const hasPills = (await passPill.count()) + (await failPill.count());
    expect(hasPills).toBeGreaterThan(0);

    // Should show expandable node list
    const nodes = page.locator('[data-testid="audit-node"]');
    expect(await nodes.count()).toBeGreaterThan(0);

    // Expand first failing node (if any)
    const firstNode = nodes.first();
    await firstNode.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-node-expanded.png', fullPage: false });
  });

  test('audit clears when switching pages', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dashboardBtn = page.locator('button', { hasText: 'dashboard' }).first();
    const secondPageBtn = page.locator('button', { hasText: 'New Cl' }).first();
    if (await dashboardBtn.count() === 0 || await secondPageBtn.count() === 0) {
      test.skip(true, 'Need dashboard + new-claim page');
      return;
    }

    await dashboardBtn.click();
    await waitForRendererReady(page);

    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    await auditBtn.click();
    const auditTabBtn = page.getByRole('tab', { name: /audit/i });
    await auditTabBtn.click();
    await expect(page.getByText('spec nodes found in DOM')).toBeVisible({ timeout: 30_000 });

    // Switch to second page
    await secondPageBtn.click();
    await page.waitForTimeout(3000);

    // Switch to Audit tab — should show idle message
    const auditTab = page.getByRole('tab', { name: /audit/i });
    await auditTab.click();
    await expect(page.getByText(/Click.*Audit.*toolbar/)).toBeVisible({ timeout: 5_000 });
  });

  test('deep audit button state depends on API key', async ({ page }) => {
    await page.waitForTimeout(2000);

    // Switch to audit tab
    const auditTab = page.getByRole('tab', { name: /audit/i });
    await auditTab.click();

    // Deep audit section should be visible
    await expect(page.getByText('Deep Audit (Vision)')).toBeVisible({ timeout: 5_000 });

    // The "Run Deep Audit" button should exist
    const deepBtn = page.getByRole('button', { name: /Run Deep Audit/i });
    await expect(deepBtn).toBeVisible();

    // It should be disabled (no mechanical audit run yet)
    await expect(deepBtn).toBeDisabled();

    await page.screenshot({ path: 'e2e/screenshots/audit-deep-audit-section.png', fullPage: false });
  });
});
