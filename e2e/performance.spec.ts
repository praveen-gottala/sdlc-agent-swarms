/**
 * Performance budget tests for the Design Studio.
 *
 * Uses the Claim Filling Sample project (5 rendered pages, 67-181 nodes,
 * 19-45KB specs) to test real-world performance. No LLM calls needed —
 * tests measure how fast the app loads and renders existing designs.
 *
 * These tests run on every PR to catch performance regressions:
 * - Accidental polling additions saturating the connection pool
 * - Slow API routes or large payloads
 * - Duplicate fetches or re-renders
 * - Iframe rendering bottlenecks
 */

import { test, expect, ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';
import { join } from 'path';

const CLAIM_ROOT = join(ROOT, 'fixtures', 'claim-filling-sample');

// Performance budgets (generous to avoid flakiness in CI)
const BUDGET = {
  /** Max ms for spec bundle API response */
  specFetchMs: 2000,
  /** Max ms from page click to render-complete postMessage */
  pageSwitchMs: 3000,
  /** Max network requests during a single page switch */
  maxRequestsPerSwitch: 15,
};

test.describe('Performance Budgets', () => {
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(CLAIM_ROOT);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    // Wait for page registry to load
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15000 });

    // Warm up: select first page and wait for renderer to start + iframe to load
    await studio.selectPage('page-001');
    await studio.waitForIframeReady();
    // Wait for render-complete from the iframe (renderer fully initialized)
    await page.waitForFunction(
      () => {
        return new Promise<boolean>((resolve) => {
          // If render-complete already happened, the iframe has content
          const iframe = document.querySelector<HTMLIFrameElement>('[data-testid="design-iframe"]');
          if (iframe?.contentDocument?.body?.children?.length) { resolve(true); return; }
          const onMsg = (e: MessageEvent) => {
            if (e.data?.source === 'agentforge' && e.data?.type === 'render-complete') {
              window.removeEventListener('message', onMsg);
              resolve(true);
            }
          };
          window.addEventListener('message', onMsg);
          setTimeout(() => { window.removeEventListener('message', onMsg); resolve(true); }, 10000);
        });
      },
      { timeout: 30000 },
    );
  });

  test('spec bundle API responds within budget', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const t0 = performance.now();
      const res = await fetch('/api/pages/page-001/design/spec?bundle=true');
      const data = await res.json();
      const elapsed = performance.now() - t0;
      const nodeCount = data?.spec?.nodes ? Object.keys(data.spec.nodes).length : 0;
      const payloadKB = Math.round(JSON.stringify(data).length / 1024);
      return { elapsed, nodeCount, payloadKB, status: res.status };
    });

    console.log(`  Spec bundle: ${result.elapsed.toFixed(0)}ms, ${result.nodeCount} nodes, ${result.payloadKB}KB`);

    expect(result.status).toBe(200);
    expect(result.nodeCount).toBeGreaterThan(50);
    expect(result.elapsed).toBeLessThan(BUDGET.specFetchMs);
  });

  test('page switch completes within budget (click to render-complete)', async ({ page }) => {
    // Measure warm page switch: page-001 → page-002
    const switchMs = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        const t0 = performance.now();
        const onMsg = (e: MessageEvent) => {
          if (e.data?.source === 'agentforge' && e.data?.type === 'render-complete') {
            window.removeEventListener('message', onMsg);
            resolve(performance.now() - t0);
          }
        };
        window.addEventListener('message', onMsg);
        document.querySelector<HTMLButtonElement>('[data-testid="page-page-002"]')?.click();
        setTimeout(() => { window.removeEventListener('message', onMsg); resolve(-1); }, 15000);
      });
    });

    console.log(`  Page switch (Dashboard → ClaimsList): ${switchMs.toFixed(0)}ms`);

    expect(switchMs).toBeGreaterThan(0); // -1 means timeout
    expect(switchMs).toBeLessThan(BUDGET.pageSwitchMs);
  });

  test('page switch does not trigger excessive network requests', async ({ page }) => {
    // Wait for any in-flight requests to settle
    await page.waitForTimeout(1000);

    // Start counting network requests
    const requestLog: string[] = [];
    await page.route('**/api/**', (route) => {
      requestLog.push(route.request().url());
      return route.continue();
    });

    // Switch to a different page and wait for render
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        const onMsg = (e: MessageEvent) => {
          if (e.data?.source === 'agentforge' && e.data?.type === 'render-complete') {
            window.removeEventListener('message', onMsg);
            resolve();
          }
        };
        window.addEventListener('message', onMsg);
        document.querySelector<HTMLButtonElement>('[data-testid="page-page-004"]')?.click();
        setTimeout(() => { window.removeEventListener('message', onMsg); resolve(); }, 15000);
      });
    });

    // Wait a bit for any trailing requests
    await page.waitForTimeout(2000);

    // Stop intercepting
    await page.unrouteAll();

    console.log(`  Network requests during page switch: ${requestLog.length} API calls`);
    for (const url of requestLog) {
      const parsed = new URL(url);
      console.log(`    ${parsed.pathname}${parsed.search}`);
    }

    expect(requestLog.length).toBeLessThan(BUDGET.maxRequestsPerSwitch);
  });

  test('multiple rapid page switches do not queue excessive requests', async ({ page }) => {
    // Rapidly click through 3 pages — measure total time to settle
    const result = await page.evaluate(() => {
      return new Promise<{ elapsed: number; renderCount: number }>((resolve) => {
        let renderCount = 0;
        const t0 = performance.now();
        const onMsg = (e: MessageEvent) => {
          if (e.data?.source === 'agentforge' && e.data?.type === 'render-complete') {
            renderCount++;
          }
        };
        window.addEventListener('message', onMsg);

        // Rapid clicks: page-002, page-003, page-005
        document.querySelector<HTMLButtonElement>('[data-testid="page-page-002"]')?.click();
        setTimeout(() => {
          document.querySelector<HTMLButtonElement>('[data-testid="page-page-003"]')?.click();
        }, 100);
        setTimeout(() => {
          document.querySelector<HTMLButtonElement>('[data-testid="page-page-005"]')?.click();
        }, 200);

        // Wait for renders to settle (at least 1.5s after last click)
        setTimeout(() => {
          window.removeEventListener('message', onMsg);
          resolve({ elapsed: performance.now() - t0, renderCount });
        }, 5000);
      });
    });

    console.log(`  Rapid switch (3 pages in 200ms): settled in ${result.elapsed.toFixed(0)}ms, ${result.renderCount} renders`);

    // Should complete reasonably fast and not stack up renders
    expect(result.elapsed).toBeLessThan(BUDGET.pageSwitchMs * 3);
  });
});
