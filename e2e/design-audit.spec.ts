import { test, expect, type Page, PET_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';

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
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15_000 });
  });

  test('audit button visible in toolbar', async ({ page }) => {
    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeVisible({ timeout: 10_000 });
  });

  test('audit button disabled when no design page is selected', async ({ page }) => {
    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeVisible({ timeout: 10_000 });
    await expect(auditBtn).toHaveAttribute('data-disabled', 'true');
  });

  test('audit section exists in inspector quality zone', async ({ page }) => {
    await studio.selectPage('dashboard');
    await studio.activateEditMode();
    const qualitySection = page.getByTestId('section-quality');
    await expect(qualitySection).toBeVisible({ timeout: 10_000 });
    await qualitySection.click();
    await expect(page.getByText('MECHANICAL AUDIT')).toBeVisible({ timeout: 5_000 });
  });

  test('audit section shows idle message before running', async ({ page }) => {
    await studio.selectPage('dashboard');
    await studio.activateEditMode();
    const qualitySection = page.getByTestId('section-quality');
    await expect(qualitySection).toBeVisible({ timeout: 10_000 });
    await qualitySection.click();
    await expect(page.getByText(/Click.*Audit.*toolbar/)).toBeVisible({ timeout: 5_000 });
  });

  test('mechanical audit runs and shows results on a rendered page', async ({ page }) => {
    await studio.selectPage('dashboard');
    await waitForRendererReady(page);

    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    await auditBtn.click();

    await studio.activateEditMode();
    const qualitySection = page.getByTestId('section-quality');
    await qualitySection.click();

    await expect(page.getByText('spec nodes found in DOM')).toBeVisible({ timeout: 30_000 });

    await page.screenshot({ path: 'e2e/screenshots/audit-mechanical-results.png', fullPage: false });

    const passPill = page.locator('text=/\\d+ Pass/');
    const failPill = page.locator('text=/\\d+ Fail/');
    const hasPills = (await passPill.count()) + (await failPill.count());
    expect(hasPills).toBeGreaterThan(0);

    const nodes = page.locator('[data-testid="audit-node"]');
    expect(await nodes.count()).toBeGreaterThan(0);

    const firstNode = nodes.first();
    await firstNode.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'e2e/screenshots/audit-node-expanded.png', fullPage: false });
  });

  test('audit clears when switching pages', async ({ page }) => {
    await studio.selectPage('dashboard');
    await waitForRendererReady(page);

    const auditBtn = page.getByRole('button', { name: 'Audit' });
    await expect(auditBtn).toBeEnabled({ timeout: 30_000 });
    await page.waitForTimeout(5000);
    await auditBtn.click();

    await studio.activateEditMode();
    const qualitySection = page.getByTestId('section-quality');
    await qualitySection.click();
    await expect(page.getByText('spec nodes found in DOM')).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('page-add-expense').click();
    await expect(page).toHaveURL(/page=add-expense/, { timeout: 10_000 });
    await page.waitForTimeout(2000);

    await expect(page.getByText(/Click.*Audit.*toolbar/)).toBeVisible({ timeout: 10_000 });
  });

  test('deep audit button state depends on API key', async ({ page }) => {
    await studio.selectPage('dashboard');
    await studio.activateEditMode();

    const qualitySection = page.getByTestId('section-quality');
    await qualitySection.click();
    await expect(page.getByText('DEEP AUDIT (VISION)')).toBeVisible({ timeout: 5_000 });

    const deepBtn = page.getByRole('button', { name: /Run Deep Audit/i });
    await expect(deepBtn).toBeVisible();
    await expect(deepBtn).toBeDisabled();

    await page.screenshot({ path: 'e2e/screenshots/audit-deep-audit-section.png', fullPage: false });
  });
});
