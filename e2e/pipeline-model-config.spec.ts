/**
 * E2E: Design Pipeline Model Configuration
 *
 * Validates the full flow:
 * 1. Navigate to Integrations → Design Pipeline tab
 * 2. Preset toggles fill dropdowns correctly
 * 3. Save persists to agentforge.yaml
 * 4. Page reload reads back saved config
 * 5. Custom model selection works
 * 6. Evaluator warning appears for non-Opus models
 */

import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse, stringify } from 'yaml';

const YAML_PATH = join(PET_ROOT, 'agentforge.yaml');
const YAML_BACKUP = join(PET_ROOT, 'agentforge.yaml.e2e-bak');

test.describe('Pipeline Model Configuration', () => {
  test.beforeAll(() => {
    if (existsSync(YAML_PATH)) {
      copyFileSync(YAML_PATH, YAML_BACKUP);
    }
  });

  test.afterAll(() => {
    if (existsSync(YAML_BACKUP)) {
      copyFileSync(YAML_BACKUP, YAML_PATH);
    }
  });

  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);

    // Remove any pipeline overrides from a previous test run
    const raw = readFileSync(YAML_PATH, 'utf-8');
    const yaml = parse(raw) as Record<string, unknown>;
    const agents = (yaml.agents ?? {}) as Record<string, unknown>;
    const providers = (agents.providers ?? {}) as Record<string, unknown>;
    const overrides = { ...(providers.overrides ?? {}) } as Record<string, string>;
    delete overrides['ux_research'];
    delete overrides['ux_planning'];
    delete overrides['ux_design'];
    delete overrides['ux_evaluator'];
    delete overrides['ux_correction'];
    const cleaned = {
      ...yaml,
      agents: { ...agents, providers: { ...providers, overrides } },
    };
    writeFileSync(YAML_PATH, stringify(cleaned));
  });

  async function navigateToDesignPipelineTab(page: import('@playwright/test').Page) {
    const sidebar = new SidebarPO(page);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await sidebar.clickNavItem('Integrations');
    await expect(page).toHaveURL(/\/integrations/, { timeout: 5000 });
    await page.getByRole('tab', { name: 'Design Pipeline' }).click();
    await expect(page.getByText('Design Pipeline Models')).toBeVisible({ timeout: 5000 });
  }

  test('Design Pipeline tab is visible and shows 5 phase cards', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    for (const label of ['Research', 'Planning', 'Design', 'Evaluate', 'Correction']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    }

    // All 5 dropdowns should be present
    const selects = page.locator('select');
    await expect(selects).toHaveCount(5);
  });

  test('Quality preset fills correct models', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    await page.getByRole('radio', { name: 'Quality' }).click();

    const selects = page.locator('select');
    await expect(selects.nth(0)).toHaveValue('claude-sonnet-4-6');  // Research
    await expect(selects.nth(1)).toHaveValue('claude-opus-4-7');    // Planning
    await expect(selects.nth(2)).toHaveValue('claude-opus-4-6');    // Design
    await expect(selects.nth(3)).toHaveValue('claude-opus-4-7');    // Evaluate
    await expect(selects.nth(4)).toHaveValue('claude-sonnet-4-6');  // Correction
  });

  test('Economy preset fills correct models', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    await page.getByRole('radio', { name: 'Economy' }).click();

    const selects = page.locator('select');
    await expect(selects.nth(0)).toHaveValue('claude-haiku-4-5');   // Research
    await expect(selects.nth(1)).toHaveValue('claude-sonnet-4-6');  // Planning
    await expect(selects.nth(2)).toHaveValue('claude-sonnet-4-6');  // Design
    await expect(selects.nth(3)).toHaveValue('claude-opus-4-7');    // Evaluate
    await expect(selects.nth(4)).toHaveValue('claude-haiku-4-5');   // Correction
  });

  test('Save persists overrides to agentforge.yaml', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    // Select Quality preset
    await page.getByRole('radio', { name: 'Quality' }).click();

    // Save
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await expect(page.getByText('Configuration saved')).toBeVisible({ timeout: 5000 });

    // Verify confirmation summary shows next-run models
    await expect(page.getByText('Next pipeline run will use:')).toBeVisible();

    // Verify YAML file
    const yaml = parse(readFileSync(YAML_PATH, 'utf-8')) as Record<string, unknown>;
    const agents = yaml.agents as Record<string, unknown>;
    const providers = agents.providers as Record<string, unknown>;
    const overrides = providers.overrides as Record<string, string>;

    expect(overrides.ux_research).toBe('claude-sonnet-4-6');
    expect(overrides.ux_planning).toBe('claude-opus-4-7');
    expect(overrides.ux_design).toBe('claude-opus-4-6');
    expect(overrides.ux_evaluator).toBe('claude-opus-4-7');
    expect(overrides.ux_correction).toBe('claude-sonnet-4-6');
  });

  test('Page reload reads back saved config and detects preset', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    // Select Quality and save
    await page.getByRole('radio', { name: 'Quality' }).click();
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await expect(page.getByText('Configuration saved')).toBeVisible({ timeout: 5000 });

    // Full page reload
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Design Pipeline' }).click();
    await expect(page.getByText('Design Pipeline Models')).toBeVisible({ timeout: 5000 });

    // Quality preset should be auto-detected
    const qualityRadio = page.getByRole('radio', { name: 'Quality' });
    await expect(qualityRadio).toBeChecked();

    // Dropdowns should reflect saved values
    const selects = page.locator('select');
    await expect(selects.nth(1)).toHaveValue('claude-opus-4-7');  // Planning
    await expect(selects.nth(2)).toHaveValue('claude-opus-4-6');  // Design
  });

  test('Custom model selection switches preset to Custom', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    // Start with Quality
    await page.getByRole('radio', { name: 'Quality' }).click();
    await expect(page.getByRole('radio', { name: 'Quality' })).toBeChecked();

    // Change Research to Opus — breaks the Quality preset
    const selects = page.locator('select');
    await selects.nth(0).selectOption('claude-opus-4-6');

    // Preset should switch to Custom
    await expect(page.getByRole('radio', { name: 'Custom' })).toBeChecked();
  });

  test('Evaluator warning shows when non-Opus model selected', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    // Initially no pipeline overrides → evaluator defaults to Sonnet (from project default)
    // Warning should be visible since evaluator is not Opus
    const warning = page.getByText('Vision quality may degrade with non-Opus models');
    await expect(warning).toBeVisible();

    // Switch to Quality preset (evaluator = opus-4-7) → warning should disappear
    await page.getByRole('radio', { name: 'Quality' }).click();
    await expect(warning).not.toBeVisible();

    // Manually change evaluator to Haiku → warning should reappear
    const selects = page.locator('select');
    await selects.nth(3).selectOption('claude-haiku-4-5');
    await expect(warning).toBeVisible();
  });

  test('Existing non-pipeline overrides are preserved on save', async ({ page }) => {
    await navigateToDesignPipelineTab(page);

    // Save Quality preset
    await page.getByRole('radio', { name: 'Quality' }).click();
    await page.getByRole('button', { name: 'Save Configuration' }).click();
    await expect(page.getByText('Configuration saved')).toBeVisible({ timeout: 5000 });

    // Verify existing overrides (architecture, code_review) are still present
    const yaml = parse(readFileSync(YAML_PATH, 'utf-8')) as Record<string, unknown>;
    const agents = yaml.agents as Record<string, unknown>;
    const providers = agents.providers as Record<string, unknown>;
    const overrides = providers.overrides as Record<string, string>;

    expect(overrides.architecture).toBe('claude-opus-4-6');
    expect(overrides.code_review).toBe('claude-haiku-4-5');
  });
});
