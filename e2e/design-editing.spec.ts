import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Editing', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 10000 });
  });

  test('inspector shows "Click an element" hint when no node selected', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    const inspector = page.getByTestId('design-inspector');
    await expect(inspector).toBeVisible();
    await expect(inspector.getByText('Click an element to edit properties')).toBeVisible();
  });

  test('can switch between Properties, AI Edits, and Chat tabs', async ({ page }) => {
    const inspector = page.getByTestId('design-inspector');
    await expect(inspector).toBeVisible();

    // Properties tab should be active by default
    const propsTab = inspector.getByRole('tab', { name: 'Properties' });
    await expect(propsTab).toHaveAttribute('aria-selected', 'true');

    // Switch to AI Edits tab
    const aiTab = inspector.getByRole('tab', { name: 'AI Edits' });
    await aiTab.click();
    await expect(aiTab).toHaveAttribute('aria-selected', 'true');
    // AI Edits shows score section
    await expect(inspector.getByText('Score')).toBeVisible();
    await expect(inspector.getByText('Iteration')).toBeVisible();

    // Switch to Chat tab
    const chatTab = inspector.getByRole('tab', { name: 'Chat' });
    await chatTab.click();
    await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    await expect(inspector.getByText('AI edits use LLM tokens')).toBeVisible();
  });

  test('AI Edits tab shows tag feedback section', async ({ page }) => {
    const inspector = page.getByTestId('design-inspector');

    // Switch to AI Edits tab
    await inspector.getByRole('tab', { name: 'AI Edits' }).click();

    // Should show the "Click an element in the canvas" prompt since no node selected
    await expect(inspector.getByText('Click an element in the canvas to add feedback')).toBeVisible();

    // Tags list should be empty
    await expect(inspector.getByText('Tags (0)')).toBeVisible();
    await expect(inspector.getByText('No feedback tags yet')).toBeVisible();
  });

  test('save button shows on rendered page and approve works', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    // Save button should be visible for rendered pages
    const saveBtn = page.getByTestId('save-spec-btn');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    // Save button text should be "Save" (no asterisk since no changes)
    await expect(saveBtn).toHaveText('Save');

    // Approve button should be visible and enabled
    const approveBtn = page.getByTestId('approve-btn');
    await expect(approveBtn).toBeVisible();
    await expect(approveBtn).toBeEnabled();
  });

  test('approve design changes status to approved', async ({ page }) => {
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    // Click approve
    const approveBtn = page.getByTestId('approve-btn');
    await expect(approveBtn).toBeVisible({ timeout: 5000 });
    await approveBtn.click();

    // After approval, the button should change to "Unlock"
    await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible({ timeout: 5000 });

    // Revert: click Unlock to set back to rendered for other tests
    await page.getByRole('button', { name: 'Unlock' }).click();
    await expect(page.getByTestId('approve-btn')).toBeVisible({ timeout: 5000 });
  });

  test('coherence check button shows with correct page count', async ({ page }) => {
    // The coherence toolbar should be visible
    const coherenceBtn = page.getByRole('button', { name: /Check Coherence|Checking/ });
    await expect(coherenceBtn).toBeVisible({ timeout: 5000 });

    // Should show how many designed pages are available
    await expect(page.getByText(/designed pages|Need 2\+/)).toBeVisible();
  });
});
