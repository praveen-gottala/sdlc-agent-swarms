/**
 * Verifies that after onboarding, the files that POST /api/spec/generate
 * reads from disk are present and contain the data entered in the wizard.
 *
 * POST /api/spec/generate reads (via getActiveProjectRoot()):
 *   1. agentforge.yaml          — project name, description, stack
 *   2. docs/prd.md              — PRD content
 *   3. agentforge/spec/design-tokens.yaml — design tokens
 *   4. agentforge/spec/brand.yaml         — brand specification
 *
 * It also requires ANTHROPIC_API_KEY (env var), but that's not a file input.
 *
 * getActiveProjectRoot() resolves via:
 *   1. AGENTFORGE_PROJECT_DIR env var
 *   2. .agentforge-dashboard-prefs.json → activeProject
 *   3. First auto-discovered project
 */

import { test, expect, ROOT } from './fixtures/test-base';
import { OnboardingPO } from './pages/onboarding.po';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';

const PROJECT_NAME = 'Spec Input Test';
const PROJECT_SLUG = 'spec-input-test';
const PROJECT_DESC = 'A task management tool for remote teams';
const PROJECT_AUDIENCE = 'Remote workers and project managers';
const PROJECT_PRD = `# Task Manager PRD

## Overview
A collaborative task management tool for distributed teams.

## Features
- Dashboard with task overview
- Kanban board for task tracking
- Team member profiles
- Real-time notifications
`;

const PROJECT_DIR = join(ROOT, 'apps', PROJECT_SLUG);
const PREFS_PATH = join(ROOT, '.agentforge-dashboard-prefs.json');

function cleanup() {
  if (existsSync(PROJECT_DIR)) {
    rmSync(PROJECT_DIR, { recursive: true, force: true });
  }
}

test.describe('Spec generation inputs after onboarding', () => {
  test.beforeAll(() => cleanup());
  test.afterAll(() => cleanup());

  test('onboarding writes all files that spec/generate reads', async ({ page }) => {
    // Intercept POST /api/spec/generate — we don't want the LLM call,
    // we just want to verify the input files exist on disk.
    let specGenerateCalled = false;
    await page.route('**/api/spec/generate', (route) => {
      specGenerateCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runId: 'test-run',
          spec: { pages: [{ name: 'Dashboard', description: 'Main dashboard' }], models: [], endpoints: [] },
          logs: [
            { ts: Date.now(), level: 'info', message: 'ANTHROPIC_API_KEY found' },
            { ts: Date.now(), level: 'info', message: `Active project root: ${PROJECT_DIR}` },
            { ts: Date.now(), level: 'info', message: `agentforge.yaml: loaded (project: "${PROJECT_NAME}")` },
            { ts: Date.now(), level: 'info', message: 'docs/prd.md: loaded (312 chars)' },
            { ts: Date.now(), level: 'info', message: 'Spec generation complete' },
          ],
        }),
      });
    });
    await page.route('**/api/spec/approve', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, written: ['pages.yaml'] }) }),
    );

    const wizard = new OnboardingPO(page);
    await page.goto('/onboarding');

    // Step 1: Project basics
    await wizard.fillName(PROJECT_NAME);
    await wizard.fillDescription(PROJECT_DESC);
    await wizard.clickNext();

    // Step 2: PRD
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await page.locator('textarea').fill(PROJECT_PRD);
    await wizard.clickNext();

    // Step 3: Design system — use defaults (no AI)
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await wizard.useDefaults();
    await wizard.waitForDesignPreview();
    await wizard.selectDesignOption();
    await wizard.clickNext();

    // Step 4: Audience + library
    await expect(page.getByText('Step 4 of 5')).toBeVisible();
    await wizard.fillAudience(PROJECT_AUDIENCE);
    await wizard.clickNext();

    // Step 5: Review + create
    await expect(page.getByText('Step 5 of 5')).toBeVisible();
    await wizard.clickCreate();

    // Wait for redirect to spec/generate
    await expect(page).toHaveURL(/\/spec\?generate=true/, { timeout: 15000 });

    // ─── Verify all 4 input files that POST /api/spec/generate reads ───

    // 1. agentforge.yaml — must exist with project name and description
    const agentforgeYamlPath = join(PROJECT_DIR, 'agentforge.yaml');
    expect(existsSync(agentforgeYamlPath)).toBe(true);
    const agentforgeYaml = parse(readFileSync(agentforgeYamlPath, 'utf-8'));
    expect(agentforgeYaml.project.name).toBe(PROJECT_NAME);
    expect(agentforgeYaml.project.description).toBe(PROJECT_DESC);
    expect(agentforgeYaml.stack).toBeDefined();

    // 2. docs/prd.md — must exist with the PRD content from the wizard
    const prdPath = join(PROJECT_DIR, 'docs', 'prd.md');
    expect(existsSync(prdPath)).toBe(true);
    const prdContent = readFileSync(prdPath, 'utf-8');
    expect(prdContent).toContain('Task Manager PRD');
    expect(prdContent).toContain('collaborative task management');
    expect(prdContent).toContain('Kanban board');

    // 3. agentforge/spec/design-tokens.yaml — must exist and not be empty
    const designTokensPath = join(PROJECT_DIR, 'agentforge', 'spec', 'design-tokens.yaml');
    expect(existsSync(designTokensPath)).toBe(true);
    const designTokens = parse(readFileSync(designTokensPath, 'utf-8'));
    expect(designTokens).toBeDefined();
    expect(designTokens).not.toBeNull();

    // 4. agentforge/spec/brand.yaml — must exist and not be empty
    const brandPath = join(PROJECT_DIR, 'agentforge', 'spec', 'brand.yaml');
    expect(existsSync(brandPath)).toBe(true);
    const brandSpec = parse(readFileSync(brandPath, 'utf-8'));
    expect(brandSpec).toBeDefined();
    expect(brandSpec).not.toBeNull();

    // ─── Verify activeProject in prefs points to this project ───
    // This is what getActiveProjectRoot() reads to find the project.
    expect(existsSync(PREFS_PATH)).toBe(true);
    const prefs = JSON.parse(readFileSync(PREFS_PATH, 'utf-8'));
    expect(prefs.activeProject).toBe(PROJECT_DIR);

    // ─── Verify spec/generate was actually called (auto=true triggered it) ───
    // Wait for the intercepted call
    await page.waitForTimeout(2000);
    expect(specGenerateCalled).toBe(true);

    // ─── Verify log panel is visible with expected entries ───
    const logPanel = page.getByTestId('spec-log-panel');
    await expect(logPanel).toBeVisible();
    await expect(logPanel.getByText('Active project root:')).toBeVisible();
    await expect(logPanel.getByText('agentforge.yaml: loaded')).toBeVisible();
    await expect(logPanel.getByText('docs/prd.md: loaded')).toBeVisible();
  });

  test('spec/generate receives null for missing optional inputs', async ({ page }) => {
    // Clean up from previous test
    cleanup();

    // This time: no PRD, no audience — verify the files that ARE written
    // and confirm the ones that AREN'T don't exist.
    let specGenerateCalled = false;
    await page.route('**/api/spec/generate', (route) => {
      specGenerateCalled = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runId: 'test-run-2',
          spec: { pages: [{ name: 'Home', description: 'Home page' }], models: [], endpoints: [] },
          logs: [
            { ts: Date.now(), level: 'info', message: 'ANTHROPIC_API_KEY found' },
            { ts: Date.now(), level: 'info', message: `Active project root: ${PROJECT_DIR}` },
            { ts: Date.now(), level: 'warn', message: 'docs/prd.md: not found — LLM will generate without PRD' },
            { ts: Date.now(), level: 'info', message: 'Spec generation complete' },
          ],
        }),
      });
    });
    await page.route('**/api/spec/approve', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, written: ['pages.yaml'] }) }),
    );

    const wizard = new OnboardingPO(page);
    await page.goto('/onboarding');

    // Step 1: Only name, no description
    await wizard.fillName(PROJECT_NAME);
    await wizard.clickNext();

    // Step 2: Skip PRD entirely
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await wizard.clickNext();

    // Step 3: Design system — use defaults
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await wizard.useDefaults();
    await wizard.waitForDesignPreview();
    await wizard.selectDesignOption();
    await wizard.clickNext();

    // Step 4: Skip audience (leave blank)
    await expect(page.getByText('Step 4 of 5')).toBeVisible();
    await wizard.clickNext();

    // Step 5: Create
    await expect(page.getByText('Step 5 of 5')).toBeVisible();
    await wizard.clickCreate();

    await expect(page).toHaveURL(/\/spec\?generate=true/, { timeout: 15000 });

    // ─── Verify required files exist ───

    // agentforge.yaml — always written
    const agentforgeYamlPath = join(PROJECT_DIR, 'agentforge.yaml');
    expect(existsSync(agentforgeYamlPath)).toBe(true);
    const agentforgeYaml = parse(readFileSync(agentforgeYamlPath, 'utf-8'));
    expect(agentforgeYaml.project.name).toBe(PROJECT_NAME);
    expect(agentforgeYaml.project.description).toBe(''); // empty, not undefined

    // design-tokens.yaml — always written
    expect(existsSync(join(PROJECT_DIR, 'agentforge', 'spec', 'design-tokens.yaml'))).toBe(true);

    // brand.yaml — always written
    expect(existsSync(join(PROJECT_DIR, 'agentforge', 'spec', 'brand.yaml'))).toBe(true);

    // ─── PRD was NOT provided, so docs/prd.md should NOT exist ───
    // spec/generate's readTextFile('docs/prd.md') will return null
    const prdPath = join(PROJECT_DIR, 'docs', 'prd.md');
    expect(existsSync(prdPath)).toBe(false);

    // activeProject still points to this project
    const prefs = JSON.parse(readFileSync(PREFS_PATH, 'utf-8'));
    expect(prefs.activeProject).toBe(PROJECT_DIR);

    await page.waitForTimeout(2000);
    expect(specGenerateCalled).toBe(true);
  });
});
