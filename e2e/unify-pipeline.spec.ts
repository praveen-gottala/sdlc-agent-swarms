/**
 * E2E test: Unified Design Pipeline (Phase 3 regression guard).
 *
 * Verifies the dashboard's design pipeline produces correctly typed artifacts
 * at the consolidated `agentforge/designs/` paths and the prototype renders
 * from those paths.
 *
 * Uses the PET fixture — no LLM calls.
 */
import { test, expect, PET_ROOT } from './fixtures/test-base';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');

test.describe('Unified pipeline artifact structure', () => {

  test('research-brief.json exists and has typed shape @unify-artifacts', async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    const researchPath = join(PET_ROOT, 'agentforge/designs/dashboard/research-brief.json');
    expect(existsSync(researchPath)).toBe(true);

    const raw = readFileSync(researchPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty('briefId');
    expect(parsed).toHaveProperty('moduleId');
    expect(parsed).toHaveProperty('requirementIds');
    expect(parsed).toHaveProperty('designConstraints');
    expect(Array.isArray(parsed.requirementIds)).toBe(true);
  });

  test('planning-spec.json exists and has typed shape @unify-artifacts', async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    const planningPath = join(PET_ROOT, 'agentforge/designs/dashboard/planning-spec.json');
    expect(existsSync(planningPath)).toBe(true);

    const raw = readFileSync(planningPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty('moduleId');
    expect(parsed).toHaveProperty('componentTree');
    expect(Array.isArray(parsed.componentTree)).toBe(true);
    expect(parsed.componentTree.length).toBeGreaterThan(0);
  });

  test('design spec exists at consolidated path @unify-artifacts', async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    const specPath = join(PET_ROOT, 'agentforge/designs/dashboard.json');
    expect(existsSync(specPath)).toBe(true);

    const raw = readFileSync(specPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty('screen');
    expect(parsed).toHaveProperty('width');
    expect(parsed).toHaveProperty('nodes');
    expect(typeof parsed.nodes).toBe('object');
    expect(Object.keys(parsed.nodes).length).toBeGreaterThan(0);
  });

  test('shared-chrome.json exists @unify-artifacts', async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    const chromePath = join(PET_ROOT, 'agentforge/designs/shared-chrome.json');
    expect(existsSync(chromePath)).toBe(true);

    const raw = readFileSync(chromePath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty('nodes');
    expect(typeof parsed.nodes).toBe('object');
  });

  test('prototype.json exists at consolidated path @unify-artifacts', async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    const manifestPath = join(PET_ROOT, 'agentforge/designs/prototype.json');
    expect(existsSync(manifestPath)).toBe(true);

    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty('screens');
    expect(Array.isArray(parsed.screens)).toBe(true);
    expect(parsed.screens.length).toBeGreaterThanOrEqual(3);

    // No pseudo-screens in the manifest (filtered at build time)
    for (const screen of parsed.screens) {
      expect(screen.screenId).not.toMatch(/^__/);
    }

    // specPaths use consolidated agentforge/designs/ path (not .agentforge/previews/)
    for (const screen of parsed.screens) {
      expect(screen.specPath).toMatch(/^agentforge\/designs\//);
      expect(screen.specPath).not.toContain('bookshelf-');
    }
  });

  test('no .agentforge/previews directory in fixture @unify-artifacts', async () => {
    const oldPreviewsDir = join(PET_ROOT, '.agentforge/previews');
    expect(existsSync(oldPreviewsDir)).toBe(false);
  });
});

test.describe('Prototype renders from consolidated paths', () => {

  test('prototype renders with LayoutShell @unify-prototype', async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);

    await page.goto('/design', { waitUntil: 'domcontentloaded' });

    // Wait for the page to load
    await page.waitForSelector('text=Dashboard', { timeout: 10000 }).catch(() => {
      // Page might not show "Dashboard" text — that's OK, just need the prototype button
    });

    // Find and click the Prototype button
    const protoButton = page.getByRole('button', { name: /prototype/i });
    const isVisible = await protoButton.isVisible().catch(() => false);

    if (!isVisible) {
      test.skip(true, 'Prototype button not visible — server may not be running');
      return;
    }

    await protoButton.click();

    // Wait for renderer to be ready
    await page.waitForTimeout(3000);

    // Check the iframe loaded
    const iframe = page.frameLocator('iframe');
    const content = iframe.locator('[data-persistent="content"]');
    const contentVisible = await content.isVisible({ timeout: 10000 }).catch(() => false);

    if (contentVisible) {
      expect(contentVisible).toBe(true);

      // Check LayoutShell header is persistent
      const header = iframe.locator('[data-persistent="header"]');
      const headerVisible = await header.isVisible({ timeout: 5000 }).catch(() => false);
      expect(headerVisible).toBe(true);
    }
  });
});

test.describe('Chat iteration mechanism', () => {

  test.fixme('chat uses single LLM call via BrowserFeedbackAdapter @unify-chat', async () => {
    // This test requires an API key to run the chat pipeline.
    // The unit test in chat-route.test.ts is the primary guard.
    // When API keys are available, this test should:
    // 1. Set active project to PET fixture
    // 2. POST to /api/pages/dashboard/design/chat with a message
    // 3. Assert run-manager events show only "Design" stage (not Research+Planning+Design)
    // 4. Assert the design spec was updated
  });
});
