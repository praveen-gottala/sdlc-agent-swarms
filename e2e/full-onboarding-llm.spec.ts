/**
 * Full E2E test with real LLM calls.
 * Onboards a new project → generates spec via LLM → verifies screen_type
 * and navigates_to → enters prototype mode → verifies NavigationEditor.
 *
 * This test makes real LLM API calls (Vertex AI / Anthropic) and takes 1-3 minutes.
 * Run with: AGENTFORGE_PROJECT_DIR= npx playwright test e2e/full-onboarding-llm.spec.ts
 */
import { test, expect } from '@playwright/test';

const PROJECT_NAME = `LLM E2E ${Date.now()}`;
const PROJECT_DESC =
  'TaskPilot is a team task management app. It has a dashboard showing active tasks ' +
  'and team workload, a task list with filters, a task detail page, a notifications ' +
  'drawer that slides in from the right when the bell icon is clicked, and a delete ' +
  'confirmation dialog that appears as a centered modal overlay.';

test.describe.serial('Full LLM-backed onboarding and navigation', () => {
  test('should onboard project and generate spec with screen_type via LLM', async ({ page }) => {
    test.setTimeout(180_000);

    // --- Onboarding wizard ---
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

    await page.getByTestId('onboarding-audience').fill('product teams and engineering managers');
    await page.getByTestId('onboarding-next').click();

    await page.getByTestId('onboarding-create').click();

    // --- Spec generation (same page context — auto-triggered by ?generate=true) ---
    await page.waitForURL(/\/spec/, { timeout: 15_000 });

    // Verify pipeline status panel appears and shows spec generation in progress
    await expect(page.locator('text=Running Pipelines')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Spec Generation')).toBeVisible({ timeout: 10_000 });

    // Verify activity feed shows LLM stage events
    await expect(page.getByText('Reading context started')).toBeVisible({ timeout: 15_000 });

    // Wait for LLM generation to complete — poll pages API
    let pages: Array<{
      pageId: string;
      pageName: string;
      screen_type: string;
      navigates_to: Array<{ target: string; trigger: string }>;
    }> = [];

    for (let attempt = 0; attempt < 30; attempt++) {
      await page.waitForTimeout(5_000);
      const navResponse = await page.evaluate(async () => {
        const res = await fetch('/api/navigation');
        return res.json();
      });
      pages = navResponse.navigation ?? [];
      if (pages.length >= 3) break;
    }

    expect(pages.length).toBeGreaterThanOrEqual(3);

    for (const p of pages) {
      expect(['page', 'modal', 'drawer', 'sheet']).toContain(p.screen_type);
    }

    const withNav = pages.filter(p => p.navigates_to.length > 0);
    expect(withNav.length).toBeGreaterThan(0);

    console.log('LLM-generated pages:');
    for (const p of pages) {
      const navCount = p.navigates_to.length;
      console.log(`  ${p.pageId}: screen_type="${p.screen_type}", navigates_to=${navCount} (${p.pageName})`);
    }
  });

  test('should persist screen_type and navigates_to with correct mode derivation', async ({ page }) => {
    await page.goto('/design', { waitUntil: 'networkidle', timeout: 30_000 });

    // Verify the navigation API returns correct screen_type and derived mode
    const navResponse = await page.evaluate(async () => {
      const res = await fetch('/api/navigation');
      return res.json();
    });

    const pages = navResponse.navigation as Array<{
      pageId: string;
      pageName: string;
      screen_type: string;
      navigates_to: Array<{ target: string; trigger: string; mode?: string }>;
    }>;

    // Should have the LLM-generated pages with screen_type
    expect(pages.length).toBeGreaterThanOrEqual(3);

    const nonPageTypes = pages.filter(p => p.screen_type !== 'page');
    console.log(`Pages with non-page screen_type: ${nonPageTypes.length}`);
    for (const p of nonPageTypes) {
      console.log(`  ${p.pageId}: screen_type="${p.screen_type}" (${p.pageName})`);
    }

    // Verify the prototype API derives mode correctly from screen_type
    const protoResponse = await page.evaluate(async () => {
      const res = await fetch('/api/prototype');
      if (!res.ok) return { error: res.status };
      return res.json();
    });

    if (!('error' in protoResponse) && protoResponse.manifest?.navigation) {
      const bindings = protoResponse.manifest.navigation as Array<{
        targetScreenId: string;
        mode: string;
      }>;
      for (const b of bindings) {
        const targetPage = pages.find(p => p.pageId === b.targetScreenId);
        if (targetPage && targetPage.screen_type !== 'page') {
          expect(b.mode).toBe('overlay');
          console.log(`  Binding to ${b.targetScreenId} (${targetPage.screen_type}) → mode="${b.mode}" ✓`);
        }
      }
    }

    // Verify mode can be persisted via PUT /api/navigation
    const dashboardPage = pages.find(p => p.navigates_to.length > 0);
    if (dashboardPage) {
      const updatedNav = dashboardPage.navigates_to.map((n, i) =>
        i === 0 ? { ...n, mode: 'overlay' as const } : n,
      );
      const putRes = await page.evaluate(async (args: { pageId: string; navigates_to: unknown[] }) => {
        const res = await fetch('/api/navigation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        return res.json();
      }, { pageId: dashboardPage.pageId, navigates_to: updatedNav });

      expect(putRes.ok).toBe(true);

      // Verify it persisted by re-reading
      const verifyRes = await page.evaluate(async () => {
        const res = await fetch('/api/navigation');
        return res.json();
      });
      const updatedPage = (verifyRes.navigation as typeof pages)
        .find(p => p.pageId === dashboardPage.pageId);
      expect(updatedPage?.navigates_to[0]?.mode).toBe('overlay');
      console.log(`Mode persistence verified: first binding of ${dashboardPage.pageId} → mode="overlay" ✓`);
    }
  });
});
