import { test, expect, ROOT } from './fixtures/test-base';
import { OnboardingPO } from './pages/onboarding.po';
import { SidebarPO } from './pages/sidebar.po';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_PROJECT_NAME = 'E2E Test App';
const TEST_PROJECT_SLUG = 'e2e-test-app';
const TEST_PROJECT_DIR = join(ROOT, TEST_PROJECT_SLUG);

function cleanupTestProject() {
  if (existsSync(TEST_PROJECT_DIR)) {
    rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
  }
}

test.describe('Onboarding', () => {
  // Clean before AND after to handle stale dirs from previous runs
  test.beforeAll(async () => {
    cleanupTestProject();
  });

  test.afterAll(async () => {
    cleanupTestProject();
  });

  test('onboarding page loads with wizard at step 1', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page.getByText('Create a project')).toBeVisible();
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await expect(page.getByTestId('onboarding-name')).toBeVisible();
  });

  test('step 1 — next button is disabled without a name', async ({ page }) => {
    await page.goto('/onboarding');
    const nextBtn = page.getByTestId('onboarding-next');
    await expect(nextBtn).toBeDisabled();

    await page.getByTestId('onboarding-name').fill('Test');
    await expect(nextBtn).toBeEnabled();
  });

  test('full wizard flow creates project and redirects to dashboard', async ({ page }) => {
    const wizard = new OnboardingPO(page);
    await page.goto('/onboarding');

    // Step 1: Project basics
    await wizard.fillName(TEST_PROJECT_NAME);
    await wizard.fillDescription('An app created by E2E tests');
    await wizard.clickNext();

    // Step 2: PRD (skip)
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await wizard.clickNext(); // "Skip" since no PRD entered

    // Step 3: Design system — use fallback (no AI)
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await wizard.useDefaults();

    // Step 3 preview: Wait for preview, select an option, then proceed
    await wizard.waitForDesignPreview();
    await wizard.selectDesignOption();
    await wizard.clickNext();

    // Step 4: Audience + library
    await expect(page.getByText('Step 4 of 5')).toBeVisible();
    await wizard.fillAudience('Developers and testers');
    await wizard.clickNext();

    // Step 5: Review + create
    await expect(page.getByText('Step 5 of 5')).toBeVisible();
    await expect(page.getByText(TEST_PROJECT_NAME)).toBeVisible();
    await expect(page.getByText('Developers and testers')).toBeVisible();

    // Intercept spec/generate and spec/approve to prevent LLM call
    await page.route('**/api/spec/generate', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ runId: 'test', spec: { pages: [{ name: 'Dashboard', description: 'Main dashboard' }], models: [], endpoints: [] }, logs: [{ ts: Date.now(), level: 'info', message: 'Spec generation complete' }] }) }),
    );
    await page.route('**/api/spec/approve', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, written: ['pages.yaml'] }) }),
    );

    // Create the project
    await wizard.clickCreate();

    // Should redirect to spec page with generate param
    await expect(page).toHaveURL(/\/spec\?generate=true/, { timeout: 15000 });

    // Verify the project directory was created on disk
    expect(existsSync(TEST_PROJECT_DIR)).toBe(true);
  });

  test('step 3 — logs panel shows generation entries', async ({ page }) => {
    const wizard = new OnboardingPO(page);
    await page.goto('/onboarding');

    // Step 1: Fill name and proceed
    await wizard.fillName('Log Test App');
    await wizard.clickNext();

    // Step 2: Skip PRD
    await wizard.clickNext();

    // Step 3: Use defaults to trigger design generation with log entries
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await wizard.useDefaults();

    // Wait for design preview (confirms generation completed)
    await wizard.waitForDesignPreview();

    // Assert logs toggle is visible with entry count > 0
    const logsToggle = wizard.getLogsToggle();
    await expect(logsToggle).toBeVisible({ timeout: 5000 });
    const count = await wizard.getLogsCount();
    expect(count).toBeGreaterThan(0);

    // Expand the logs panel
    await wizard.expandLogs();

    // Assert log entries are visible
    const entries = wizard.getLogEntries();
    await expect(entries.first()).toBeVisible();
    expect(await entries.count()).toBeGreaterThan(0);

    // Verify expected log messages
    await expect(page.getByText(/Generating design options/)).toBeVisible();
    await expect(page.getByText(/design options received/)).toBeVisible();
  });

  test('newly created project is discoverable after switching away', async ({ page, setActiveProject }) => {
    if (!existsSync(TEST_PROJECT_DIR)) {
      test.skip(true, 'Test project was not created by previous test');
      return;
    }

    // Switch to PET first, then switch back to verify the project persists
    const petRoot = join(ROOT, 'personal-expense-tracker');
    setActiveProject(petRoot);
    await page.goto('/');
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 10000 });

    // Now switch back to the test project
    setActiveProject(TEST_PROJECT_DIR);
    await page.goto('/');
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 10000 });
    await expect(page.getByTestId('project-name')).toHaveText(TEST_PROJECT_NAME, { timeout: 10000 });
  });
});
