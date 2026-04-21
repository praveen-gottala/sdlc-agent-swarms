/**
 * Plan B acceptance-criteria E2E tests.
 *
 * Each `test.fixme()` below is a concrete acceptance check for one phase in
 * `docs/plans/screen-types-plan-b.md`. As each phase lands, flip the
 * corresponding fixme(s) to `test()` — DO NOT delete them.
 *
 * Tag conventions:
 *   @b0a  — duplicate pages fix (POST /api/pages dedup + fixture cleanup)
 *   @b0b  — navigateTo propagation (Stage 4 prompt + programmatic validation)
 *   @b1   — Chrome Pass (shared-chrome.json + cross-page consistency)
 *   @b2   — LayoutShell (persistent chrome in prototype)
 *
 * Run a single phase:
 *   npx playwright test e2e/screen-types-plan-b.spec.ts -g "@b1"
 *
 * Reference fixture: fixtures/personal-expense-tracker. State is backed up
 * and restored by `e2e/fixtures/test-base.ts` for test isolation.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { FrameLocator, Page } from '@playwright/test';
import { test, expect, PET_ROOT } from './fixtures/test-base';

/**
 * Wait until the dashboard reports the Vite renderer on :4100 is ready.
 *
 * When a page mounts `/design`, `useEffect` probes `/api/renderer/status` and
 * may issue `/api/renderer/restart` (e.g. if it sees an externally-started
 * Vite as "stale"). That kills the Vite on :4100 and spawns a fresh one.
 * Tests that navigate the iframe before Vite comes back up get blank frames
 * or `ERR_CONNECTION_REFUSED`. Poll until the server confirms `ready`.
 */
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
      // Next may be briefly unresponsive while compiling — retry.
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `Renderer on :4100 not ready within ${timeoutMs}ms (last status: ${lastStatus}). `
      + 'Check that both dev servers are running: npm run dev:dashboard',
  );
}

const PAGES_YAML_PATH = join(PET_ROOT, 'agentforge/spec/pages.yaml');
const PREVIEWS_DIR = join(PET_ROOT, '.agentforge/previews');
const SHARED_CHROME_PATH = join(PREVIEWS_DIR, 'shared-chrome.json');

interface PageEntry {
  id: string;
  name: string;
  description: string;
  route: string;
  status: string;
  designStatus?: string;
  components?: string[];
  navigates_to?: Array<{ target: string; trigger: string; source_node?: string }>;
  screen_type?: 'page' | 'modal' | 'drawer' | 'sheet';
}

function readPagesYaml(): { pages: PageEntry[] } {
  const raw = readFileSync(PAGES_YAML_PATH, 'utf-8');
  return parseYaml(raw) as { pages: PageEntry[] };
}

function readPrototypeManifest(): {
  screens: Array<{ screenId: string; name: string; specPath: string }>;
  navigation: Array<{ sourceScreenId: string; targetScreenId: string; sourceNodeId: string; mode?: string }>;
} | null {
  const path = join(PREVIEWS_DIR, 'prototype.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function readDesignSpec(pageId: string): { nodes: Record<string, { parent: string | null; catalog?: string; navigateTo?: string; order: number }> } | null {
  const path = join(PREVIEWS_DIR, `bookshelf-${pageId}`, 'scripts', 'designspec-v2.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const PET_SHARED_CHROME_FALLBACK = join(PET_ROOT, 'shared-chrome.e2e.json');

function readSharedChromeForSpecs(): { regions: Record<string, string[]> } | null {
  const p = existsSync(SHARED_CHROME_PATH) ? SHARED_CHROME_PATH : PET_SHARED_CHROME_FALLBACK;
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8')) as { regions: Record<string, string[]> };
}

function listBookshelfPageIds(): string[] {
  if (!existsSync(PREVIEWS_DIR)) return [];
  return readdirSync(PREVIEWS_DIR)
    .filter((d) => d.startsWith('bookshelf-'))
    .map((d) => d.slice('bookshelf-'.length));
}

function compactNodeId(id: string): string {
  return id.replace(/-/g, '').toLowerCase();
}

function rootChildIds(spec: NonNullable<ReturnType<typeof readDesignSpec>>): string[] {
  return Object.entries(spec.nodes)
    .filter(([, n]) => n.parent === 'root')
    .map(([id]) => id);
}

function chromeRootMatch(rootChildren: string[], chromeId: string): 'exact' | 'compact' | 'none' {
  if (rootChildren.includes(chromeId)) return 'exact';
  const c = compactNodeId(chromeId);
  if (rootChildren.some((id) => compactNodeId(id) === c)) return 'compact';
  return 'none';
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
// Phase B0a — Fix Duplicate Pages
// ---------------------------------------------------------------------------

test.describe('Plan B — Phase B0a: Duplicate pages fix @b0a', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('POST /api/pages deduplicates by route (second call returns existing id)', async ({ request }) => {
    // Slug is truncated to 40 chars — put a unique token first so the route is unique per run.
    const description = `B0a-dedup-probe-${Date.now()} user settings for profile and preferences`;

    const first = await request.post('/api/pages', { data: { description } });
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()) as { pageId: string };
    expect(firstBody.pageId).toBeTruthy();

    const second = await request.post('/api/pages', { data: { description } });
    // Per plan: dedup hit returns 200 (not 201) so callers can distinguish.
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as { pageId: string };
    expect(secondBody.pageId).toBe(firstBody.pageId);

    const list = await request.get('/api/pages');
    const listBody = (await list.json()) as { pages: Array<{ id: string }> };
    const matches = listBody.pages.filter((p) => p.id === firstBody.pageId);
    expect(matches).toHaveLength(1);
  });

  test('fixture pages.yaml contains no duplicate user-settings drafts', async () => {
    const { pages } = readPagesYaml();
    const duplicates = pages.filter((p) =>
      p.id.startsWith('page-a-user-settings-page-for-profile-and-pre-'),
    );
    expect(duplicates).toHaveLength(0);

    // Also: no two pages share the same route.
    const routes = pages.map((p) => p.route);
    const uniqueRoutes = new Set(routes);
    expect(uniqueRoutes.size).toBe(routes.length);
  });

  test('approved pages remain intact after fixture cleanup', async () => {
    const { pages } = readPagesYaml();
    const approvedIds = pages.filter((p) => p.status === 'approved').map((p) => p.id);
    expect(approvedIds).toEqual(
      expect.arrayContaining(['dashboard', 'add-expense', 'spending-insights']),
    );
  });

  test('navigates_to entries do not reference deleted draft pages', async () => {
    const { pages } = readPagesYaml();
    const validIds = new Set(pages.map((p) => p.id));
    for (const page of pages) {
      for (const nav of page.navigates_to ?? []) {
        expect(validIds.has(nav.target)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Phase B0b — navigateTo propagation (Stage 4)
// ---------------------------------------------------------------------------

test.describe('Plan B — Phase B0b: navigateTo propagation @b0b', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('dashboard designspec has navigateTo on NavigationTabs children', async ({}, testInfo) => {
    const spec = readDesignSpec('dashboard');
    if (!spec) {
      testInfo.skip(
        true,
        'Run agentforge design:page:all for personal-expense-tracker to generate .agentforge/previews (gitignored).',
      );
      return;
    }
    const targets = new Set<string>();
    for (const node of Object.values(spec!.nodes)) {
      if (node.navigateTo) targets.add(node.navigateTo);
    }
    expect(targets).toEqual(
      expect.objectContaining(
        new Set(['add-expense', 'spending-insights']),
      ) as unknown as Set<string>,
    );
    // At minimum the tab-level bindings should survive flattening.
    expect(targets.has('add-expense')).toBe(true);
    expect(targets.has('spending-insights')).toBe(true);
  });

  test('prototype manifest has ≥ 3 spec-driven navigation bindings', async ({}, testInfo) => {
    const manifest = readPrototypeManifest();
    if (!manifest) {
      testInfo.skip(
        true,
        'Run agentforge design:page:all for personal-expense-tracker to generate prototype.json in previews.',
      );
      return;
    }
    expect(manifest!.navigation.length).toBeGreaterThanOrEqual(3);

    // The 3 canonical page-to-page tab bindings:
    const tabBindings = manifest!.navigation.filter(
      (b) =>
        (b.sourceScreenId === 'dashboard' && b.targetScreenId === 'add-expense') ||
        (b.sourceScreenId === 'dashboard' && b.targetScreenId === 'spending-insights') ||
        (b.sourceScreenId === 'add-expense' && b.targetScreenId === 'dashboard'),
    );
    expect(tabBindings.length).toBeGreaterThanOrEqual(2);
  });

  test.fixme('design pipeline run logs spec-driven bindings, not LLM fallback', async () => {
    // This check is observational — requires a fresh pipeline run.
    // Flip to `test()` only when the agentforge design:page:all CLI output
    // includes "Spec-driven navigation: N bindings" with N >= 3 AND does NOT
    // log "No spec-driven bindings, falling back to LLM analysis..." for the
    // personal-expense-tracker fixture.
    //
    // Implementation note: capture the CLI output in a file during the run
    // and assert on it here. Do NOT call the LLM in the test itself.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase B1 — Chrome Pass
// ---------------------------------------------------------------------------

test.describe('Plan B — Phase B1: Chrome Pass @b1', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('shared-chrome.json is produced at .agentforge/previews/shared-chrome.json', async ({}, testInfo) => {
    if (!existsSync(SHARED_CHROME_PATH)) {
      testInfo.skip(
        true,
        'Run `agentforge design:page:all` for personal-expense-tracker to generate shared-chrome.json (gitignored).',
      );
      return;
    }
    expect(existsSync(SHARED_CHROME_PATH)).toBe(true);
    const chrome = JSON.parse(readFileSync(SHARED_CHROME_PATH, 'utf-8')) as {
      screen: string;
      regions: Record<string, string[]>;
      nodes: Record<string, unknown>;
    };
    expect(chrome.screen).toBe('__chrome__');
    expect(chrome.regions).toBeDefined();
    expect(Object.keys(chrome.nodes).length).toBeGreaterThan(1);
  });

  test('shared chrome regions place all chrome in header for desktop expense-tracker', async ({}, testInfo) => {
    if (!existsSync(SHARED_CHROME_PATH)) {
      testInfo.skip(
        true,
        'Run `agentforge design:page:all` for personal-expense-tracker to generate shared-chrome.json (gitignored).',
      );
      return;
    }
    const chrome = JSON.parse(readFileSync(SHARED_CHROME_PATH, 'utf-8')) as {
      regions: Record<string, string[]>;
    };
    expect(chrome.regions.header).toBeDefined();
    expect(chrome.regions.header.length).toBeGreaterThanOrEqual(2);
    expect(chrome.regions.footer).toBeUndefined();
  });

  test('page specs share identical chrome subtrees (only active-tab override differs)', async ({}, testInfo) => {
    if (!existsSync(SHARED_CHROME_PATH)) {
      testInfo.skip(
        true,
        'Run `agentforge design:page:all` for personal-expense-tracker to generate designspecs and shared-chrome (gitignored).',
      );
      return;
    }
    const dashSpec = readDesignSpec('dashboard');
    const addSpec = readDesignSpec('add-expense');
    if (!dashSpec || !addSpec) {
      testInfo.skip(
        true,
        'Missing bookshelf-*/scripts/designspec-v2.json under .agentforge/previews (run design:page:all).',
      );
      return;
    }
    expect(dashSpec).not.toBeNull();
    expect(addSpec).not.toBeNull();

    // Top bar: V2 specs often use id `top-bar` with `type: 'header'` (no catalog).
    function findTopBarNode(spec: NonNullable<ReturnType<typeof readDesignSpec>>) {
      const direct = spec.nodes['top-bar'] as Record<string, unknown> | undefined;
      if (direct) return direct;
      const byCatalog = Object.entries(spec.nodes).find(
        ([, n]) => (n as { catalog?: string }).catalog === 'top-bar',
      );
      return byCatalog?.[1] as Record<string, unknown> | undefined;
    }

    const dashTop = findTopBarNode(dashSpec!);
    const addTop = findTopBarNode(addSpec!);
    expect(dashTop).toBeDefined();
    expect(addTop).toBeDefined();

    // Strip fields allowed to differ per page (active state, order).
    function canonical(node: unknown): unknown {
      const { active: _a, order: _o, ...rest } = node as Record<string, unknown>;
      return rest;
    }
    expect(canonical(dashTop!)).toEqual(canonical(addTop!));
  });

  test('exactly one NavigationTabs child has active=true per page', async ({}, testInfo) => {
    if (!existsSync(SHARED_CHROME_PATH)) {
      testInfo.skip(
        true,
        'Run `agentforge design:page:all` for personal-expense-tracker (gitignored previews).',
      );
      return;
    }
    for (const pageId of ['dashboard', 'add-expense', 'spending-insights']) {
      const spec = readDesignSpec(pageId);
      if (!spec) {
        testInfo.skip(true, 'Missing designspec for ' + pageId);
        return;
      }
      expect(spec).not.toBeNull();
      const tabs = Object.entries(spec!.nodes).filter(
        ([id, n]) =>
          (n as { catalog?: string }).catalog === 'tab' ||
          (!!(n as { navigateTo?: string }).navigateTo && /-tab$/i.test(id)),
      ).map(([, n]) => n);
      const active = tabs.filter((n) => (n as { active?: boolean }).active === true);
      expect(active).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase B2 — LayoutShell persistent chrome
// ---------------------------------------------------------------------------

test.describe('Plan B — Phase B2: LayoutShell @b2', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    // Don't wait for networkidle — the page fires renderer restart/status polling
    // in the background which keeps the network busy. domcontentloaded is enough
    // to start asserting, and we explicitly wait for the renderer below.
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({
      timeout: 20_000,
    });
    // The design page may kill + respawn Vite on :4100 if it sees an externally
    // started renderer as stale. Wait for the new Vite to be serving before we
    // click Prototype — otherwise the iframe loads before the server is up.
    await waitForRendererReady(page);
    await page.getByRole('button', { name: 'Prototype' }).click();
    await expect(page.locator('text=Prototype Mode')).toBeVisible({ timeout: 30_000 });
  });

  test('chrome DOM nodes persist across screen navigation (mountId unchanged) @b2-persistence', async ({ page }) => {
    const iframe = page.frameLocator('iframe').first();
    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    const initialMountId = await header.getAttribute('data-mount-id');
    expect(initialMountId).toBeTruthy();

    // Navigate via the ScreenSelectorBar — it always calls navigateTo() and is
    // unambiguously matched by exact name (the topbar "+ Add Expense" button
    // wouldn't be, and it has no navigation binding anyway).
    await iframe.getByRole('button', { name: 'Add Expense', exact: true }).click();
    await page.waitForTimeout(200);

    const afterMountId = await header.getAttribute('data-mount-id');
    expect(afterMountId).toBe(initialMountId);
  });

  test('content area mounts a new subtree on screen navigation @b2-content-swap', async ({ page }) => {
    const iframe = page.frameLocator('iframe').first();
    const content = iframe.locator('[data-persistent="content"]');
    await expect(content).toBeVisible({ timeout: 15_000 });

    const dashboardMarker = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(dashboardMarker).toBe('dashboard');

    await iframe.getByRole('button', { name: 'Add Expense', exact: true }).click();
    await page.waitForTimeout(200);

    const addMarker = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(addMarker).toBe('add-expense');
    expect(addMarker).not.toBe(dashboardMarker);
  });

  test('overlay flow still works with LayoutShell wrapping PrototypeApp @b2-overlays', async ({ page }) => {
    const iframe = page.frameLocator('iframe').first();
    const overlayTrigger = iframe.locator('[data-nav-mode="overlay"]').first();
    if ((await overlayTrigger.count()) === 0) {
      test.skip(true, 'fixture has no overlay-mode navigation hotspots — add modal/drawer bindings or skip');
    }
    await overlayTrigger.click();
    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Plan B — Phase B2: LayoutShell fallback @b2-fallback', () => {
  test('graceful fallback: prototype renders without chromeSpec @b2-fallback', async ({
    page,
    setActiveProject,
  }) => {
    await page.route('**/api/prototype', async route => {
      const res = await route.fetch();
      let data: Record<string, unknown>;
      try {
        data = await res.json();
      } catch {
        await route.continue();
        return;
      }
      data.chromeSpec = null;
      await route.fulfill({
        status: res.status(),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
    });

    setActiveProject(PET_ROOT);
    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({
      timeout: 20_000,
    });
    await waitForRendererReady(page);
    await page.getByRole('button', { name: 'Prototype' }).click();
    await expect(page.locator('text=Prototype Mode')).toBeVisible({ timeout: 30_000 });

    const iframe = page.frameLocator('iframe').first();
    await expect(iframe.locator('[data-persistent="header"]')).toHaveCount(0);
    await expect(iframe.locator('[data-node]').first()).toBeVisible({ timeout: 15_000 });
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Phase B2.5 — Integration validation & regression hardening
// ---------------------------------------------------------------------------

test.describe('Plan B — Phase B2.5: duplicate chrome @b2.5-no-duplicate-chrome @b2.5-visual-pet', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await gotoPetPrototype(page);
  });

  test('header chrome is not duplicated into the content slot @b2.5-no-duplicate-chrome @b2.5-visual-pet', async ({
    page,
  }) => {
    const iframe = page.frameLocator('iframe').first();
    const header = iframe.locator('[data-persistent="header"]');
    const footer = iframe.locator('[data-persistent="footer"]');
    const content = iframe.locator('[data-persistent="content"]');
    await expect(header).toBeVisible({ timeout: 15_000 });

    // Primary chrome ids from Chrome Pass / PET (exact `data-node` values from DesignSpecRenderer).
    const topChrome = header.locator('[data-node="topbar"], [data-node="top-bar"]');
    const topInContent = content.locator('[data-node="topbar"], [data-node="top-bar"]');
    const navChrome = header.locator('[data-node="nav-tabs"], [data-node="navigation-tabs"]');
    const navInContent = content.locator('[data-node="nav-tabs"], [data-node="navigation-tabs"]');

    expect(await topChrome.count(), 'LayoutShell should render exactly one top chrome').toBe(1);
    expect(await topInContent.count(), 'top chrome must not duplicate into content').toBe(0);
    expect(await navChrome.count(), 'LayoutShell should render tabs in header chrome').toBeGreaterThanOrEqual(1);
    expect(await navInContent.count(), 'nav chrome must not duplicate into content').toBe(0);
  });
});

test.describe('Plan B — Phase B2.5: persistent overlay @b2.5-no-persistent-overlay @b2.5-visual-pet', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await gotoPetPrototype(page);
  });

  test('PET dashboard content has no visible overlay/dialog shell on load @b2.5-no-persistent-overlay @b2.5-visual-pet', async ({
    page,
  }) => {
    const iframe = page.frameLocator('iframe').first();
    const overlay = iframe
      .locator('[data-persistent="content"]')
      .locator('[data-node*="overlay"], [data-node*="dialog"], [data-node*="modal"]')
      .first();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
  });
});

test.describe('Plan B — Phase B2.5: pseudo-screen filter @b2.5-no-pseudo-screen @b2.5-visual-pet', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await gotoPetPrototype(page);
  });

  test('selector has no pseudo ids and default screen marker is real @b2.5-no-pseudo-screen @b2.5-visual-pet', async ({
    page,
  }) => {
    const iframe = page.frameLocator('iframe').first();
    await expect(iframe.getByRole('button', { name: /^__/ })).toHaveCount(0);

    const marker = await iframe
      .locator('[data-persistent="content"] [data-screen-marker]')
      .first()
      .getAttribute('data-screen-marker');
    expect(marker).toBeTruthy();
    expect(marker!.startsWith('__')).toBe(false);

    const { pages } = readPagesYaml();
    const approvedIds = new Set(pages.filter((p) => p.status === 'approved').map((p) => p.id));
    expect(approvedIds.has(marker!)).toBe(true);
  });
});

test.describe('Plan B — Phase B2.5: spec invariants @b2.5-spec-invariants', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('no root-level overlay backdrop nodes in page designspecs @b2.5-spec-no-root-overlay @b2.5-spec-invariants', async (
    {},
    testInfo,
  ) => {
    const ids = listBookshelfPageIds();
    if (ids.length === 0) {
      testInfo.skip(true, 'Missing .agentforge/previews — run design:page:all for PET');
      return;
    }
    const { pages } = readPagesYaml();
    const pageTypes = new Map(pages.map((p) => [p.id, p.screen_type ?? 'page']));
    const overlayBg = /^(overlay|scrim|modal-?(bg|backdrop)|backdrop)$/i;
    /** Stored PET specs may still carry a root scrim until UX-design stops emitting it; runtime strips via ADR-040. */
    const petRootOverlayDebt = new Set(['settings-dialog-overlay']);

    for (const pageId of ids) {
      if (pageTypes.get(pageId) !== 'page') continue;
      const spec = readDesignSpec(pageId);
      if (!spec) continue;
      for (const [nid, node] of Object.entries(spec.nodes)) {
        if (node.parent !== 'root') continue;
        const overrides = (node as { overrides?: { position?: string } }).overrides ?? {};
        const pos = overrides.position;
        if (pos !== 'absolute' && pos !== 'fixed') continue;
        const bg = String((node as { background?: string }).background ?? '');
        if (!overlayBg.test(bg)) continue;
        if (petRootOverlayDebt.has(nid)) continue;
        throw new Error(`Unexpected root overlay on ${pageId} node ${nid} (background=${bg})`);
      }
    }
  });

  test('chrome region roots align with page specs (exact or compact) @b2.5-spec-chrome-alignment @b2.5-spec-invariants', async (
    {},
    testInfo,
  ) => {
    const chrome = readSharedChromeForSpecs();
    if (!chrome?.regions) {
      testInfo.skip(true, 'No shared-chrome.json or shared-chrome.e2e.json for PET');
      return;
    }
    const ids = listBookshelfPageIds();
    if (ids.length === 0) {
      testInfo.skip(true, 'Missing .agentforge/previews — run design:page:all for PET');
      return;
    }
    const chromeIds = [
      ...(chrome.regions.header ?? []),
      ...(chrome.regions.sidebar ?? []),
      ...(chrome.regions.footer ?? []),
    ];
    for (const pageId of ids) {
      const spec = readDesignSpec(pageId);
      if (!spec) continue;
      const roots = rootChildIds(spec);
      for (const cid of chromeIds) {
        const m = chromeRootMatch(roots, cid);
        expect(
          m,
          `Chrome id "${cid}" not aligned for page ${pageId} (tiers 1–2); roots=${roots.join(',')}`,
        ).not.toBe('none');
      }
    }
  });
});

test.fixme(
  '@b2.5-single-screen-chrome — wire design-generate to load shared-chrome.json (out of scope for B2.5)',
  async () => {
    // Tripwire: flip to test() when design-generate.ts passes frozenChromeSpec like design-page-all.ts.
    expect(true).toBe(true);
  },
);

test.describe('Plan B — Phase B2.5: project discovery @b2.5-project-discovery', () => {
  test('GET /api/projects returns apps with agentforge.yaml @b2.5-project-discovery', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as Array<{ id: string; path: string }>;
    expect(Array.isArray(body)).toBe(true);
    for (const p of body) {
      expect(p.id).toBeTruthy();
      expect(p.path).toBeTruthy();
      expect(existsSync(join(p.path, 'agentforge.yaml'))).toBe(true);
    }
  });
});

test.describe('Plan B — Phase B2.5: overlay navigation @b2.5-overlay-navigation', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await gotoPetPrototype(page);
  });

  test('overlay opens above content; Escape closes; header mountId stable @b2.5-overlay-navigation', async ({
    page,
  }) => {
    const iframe = page.frameLocator('iframe').first();
    const overlayTrigger = iframe.locator('[data-nav-mode="overlay"]').first();
    if ((await overlayTrigger.count()) === 0) {
      test.skip(true, 'fixture has no overlay-mode navigation hotspots');
    }
    const header = iframe.locator('[data-persistent="header"]');
    await expect(header).toBeVisible();
    const mountBefore = await header.getAttribute('data-mount-id');

    await overlayTrigger.click();
    const dialog = iframe.locator('dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    const content = iframe.locator('[data-persistent="content"]');
    const dialogBox = await dialog.boundingBox();
    const contentBox = await content.boundingBox();
    expect(dialogBox && contentBox && dialogBox.y <= contentBox.y).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    expect(await header.getAttribute('data-mount-id')).toBe(mountBefore);
  });
});

test.describe('Plan B — Phase B2.5: chrome consistency @b2.5-chrome-consistency @b2.5-visual-pet', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await gotoPetPrototype(page);
  });

  test('top chrome computed-style fingerprint matches across PET pages @b2.5-chrome-consistency @b2.5-visual-pet', async ({
    page,
  }) => {
    const iframe = page.frameLocator('iframe').first();
    async function topBarFingerprint(): Promise<string> {
      return iframe.locator('[data-persistent="header"]').evaluate((header) => {
        const el =
          header.querySelector('[data-node*="top-bar"]')
          ?? header.querySelector('[data-node*="topbar"]')
          ?? header.firstElementChild;
        if (!el) return '';
        const cs = getComputedStyle(el);
        const keys = [
          'width',
          'height',
          'paddingTop',
          'paddingBottom',
          'display',
          'flexDirection',
          'justifyContent',
          'alignItems',
        ] as const;
        return keys.map((k) => `${k}:${cs.getPropertyValue(k)}`).join('|');
      });
    }

    const fpDash = await topBarFingerprint();
    expect(fpDash.length).toBeGreaterThan(10);

    await iframe.getByRole('button', { name: 'Add Expense', exact: true }).last().click();
    await page.waitForTimeout(300);
    const fpAdd = await topBarFingerprint();

    await iframe.getByRole('button', { name: 'Spending Insights' }).click();
    await page.waitForTimeout(300);
    const fpInsights = await topBarFingerprint();

    expect(fpAdd).toBe(fpDash);
    expect(fpInsights).toBe(fpDash);
  });
});

test.describe.serial('Plan B — Phase B2.5: full loop @b2.5-full-loop', () => {
  test('onboard → design all → prototype with LayoutShell @b2.5-full-loop', async ({ page, request }) => {
    test.skip(
      !process.env.ANTHROPIC_API_KEY && process.env.AGENTFORGE_USE_VERTEX !== 'true',
      'Requires ANTHROPIC_API_KEY or Vertex (AGENTFORGE_USE_VERTEX=true)',
    );
    test.setTimeout(900_000);

    const projectName = `B25 Full ${Date.now()}`;
    const projectDesc =
      'TaskPilot is a team task management app. It has a dashboard showing active tasks '
      + 'and team workload, a task list with filters, a task detail page, and a notifications '
      + 'drawer that slides in from the right when the bell icon is clicked.';

    await page.goto('/onboarding');
    await expect(page.getByTestId('onboarding-name')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('onboarding-name').fill(projectName);
    await page.getByTestId('onboarding-desc').fill(projectDesc);
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-use-defaults').click({ timeout: 10_000 });
    const obFrame = page.locator('iframe').first();
    await obFrame.waitFor({ state: 'attached', timeout: 10_000 });
    await page.waitForTimeout(2_000);
    await page.evaluate(() => {
      window.postMessage(
        { source: 'agentforge-design-preview', type: 'design-option-selected', optionIndex: 0 },
        window.location.origin,
      );
    });
    await expect(page.locator('text=Selected:')).toBeVisible({ timeout: 5_000 });
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-audience').fill('product teams');
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-create').click();
    await page.waitForURL(/\/spec/, { timeout: 15_000 });

    let navCount = 0;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(5_000);
      const navRes = await request.get('/api/navigation');
      const navJson = (await navRes.json()) as { navigation?: unknown[] };
      navCount = navJson.navigation?.length ?? 0;
      if (navCount >= 3) break;
    }
    expect(navCount).toBeGreaterThanOrEqual(3);

    const genRes = await request.post('/api/design/generate-all', { timeout: 800_000 });
    expect(genRes.ok(), await genRes.text()).toBe(true);
    const genBody = (await genRes.json()) as { projectRoot?: string };
    expect(genBody.projectRoot).toBeTruthy();
    const sharedChrome = join(genBody.projectRoot!, '.agentforge/previews/shared-chrome.json');
    expect(existsSync(sharedChrome)).toBe(true);

    await page.goto('/design', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Pages' })).toBeVisible({ timeout: 20_000 });
    await waitForRendererReady(page);
    await page.getByRole('button', { name: 'Prototype' }).click();
    await expect(page.locator('text=Prototype Mode')).toBeVisible({ timeout: 30_000 });

    const iframe = page.frameLocator('iframe').first();
    await expect(iframe.locator('[data-persistent="header"]')).toBeVisible({ timeout: 30_000 });
    await expect(iframe.locator('[data-persistent="content"]')).toBeVisible();

    await expect(iframe.getByRole('button', { name: /^__/ })).toHaveCount(0);

    const header = iframe.locator('[data-persistent="header"]');
    const content = iframe.locator('[data-persistent="content"]');
    const initialHeaderMount = await header.getAttribute('data-mount-id');
    const initialContentMount = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(initialHeaderMount).toBeTruthy();

    const protoRes = await request.get('/api/prototype');
    expect(protoRes.ok()).toBe(true);
    const protoJson = (await protoRes.json()) as {
      manifest?: { screens: Array<{ name: string; screenId: string }> };
    };
    const screens = (protoJson.manifest?.screens ?? []).filter((s) => !s.screenId.startsWith('__'));
    expect(screens.length).toBeGreaterThanOrEqual(2);
    const targetScreen = screens.find((s) => s.screenId !== initialContentMount) ?? screens[1];
    await iframe.getByRole('button', { name: targetScreen.name, exact: true }).click();
    await page.waitForTimeout(400);
    expect(await header.getAttribute('data-mount-id')).toBe(initialHeaderMount);
    const afterMarker = await content.locator('[data-screen-marker]').getAttribute('data-screen-marker');
    expect(afterMarker).not.toBe(initialContentMount);
  });
});

// ---------------------------------------------------------------------------
// Cross-phase smoke: prototype manifest contract stays stable
// ---------------------------------------------------------------------------

test.describe('Plan B — manifest contract smoke', () => {
  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
  });

  test('prototype manifest has required top-level fields when present', async () => {
    const manifest = readPrototypeManifest();
    test.skip(!manifest, 'prototype.json not generated yet — run agentforge design:page:all');
    expect(manifest!.screens).toBeDefined();
    expect(Array.isArray(manifest!.screens)).toBe(true);
    expect(manifest!.navigation).toBeDefined();
    expect(Array.isArray(manifest!.navigation)).toBe(true);
  });
});
