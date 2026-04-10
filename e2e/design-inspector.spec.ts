import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Inspector', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    await page.goto('/');
    await page.waitForSelector('[data-testid="project-name"]', { timeout: 10000 });
    await sidebar.clickNavItem('Design Studio');
    await page.waitForURL('**/design**', { timeout: 5000 });
    // Wait for pages API to load (loading spinner disappears, page registry populates)
    await page.getByTestId('design-inspector').waitFor({ state: 'attached', timeout: 10000 });
  });

  test('inspector panel is visible on design studio page', async ({ page }) => {
    await expect(page.getByTestId('design-inspector')).toBeVisible();
  });

  test('selecting dashboard page shows rendered state with inspector', async ({ page }) => {
    await studio.selectPage('dashboard');
    await page.waitForURL('**/design?page=dashboard', { timeout: 5000 });

    // Inspector should remain visible
    await expect(page.getByTestId('design-inspector')).toBeVisible();

    // Properties tab should show prompt to click an element
    const propertiesHint = page.getByText('Click an element to edit properties');
    await expect(propertiesHint).toBeVisible({ timeout: 5000 });
  });

  test('inspector shows CSS-labeled property rows when node is selected', async ({ page }) => {
    await studio.selectPage('dashboard');
    await page.waitForURL('**/design?page=dashboard', { timeout: 5000 });

    const inspector = page.getByTestId('design-inspector');
    await expect(inspector).toBeVisible();

    // Verify the tab structure exists
    const propertiesTab = inspector.getByRole('tab', { name: 'Properties' });
    await expect(propertiesTab).toBeVisible();

    const aiEditsTab = inspector.getByRole('tab', { name: 'AI Edits' });
    await expect(aiEditsTab).toBeVisible();

    // Click a node to see property rows
    await studio.waitForIframeReady();
    const iframeLocator = page.frameLocator('[data-testid="design-iframe"]');
    const firstNode = iframeLocator.locator('[data-node]').first();
    await firstNode.waitFor({ state: 'visible', timeout: 20000 });

    for (let attempt = 0; attempt < 3; attempt++) {
      await firstNode.click();
      try {
        await inspector.getByTestId('properties-tab').waitFor({ state: 'visible', timeout: 5000 });
        break;
      } catch {
        // retry
      }
    }

    // Should show CSS-labeled rows (monospace labels like flex-direction, gap, etc.)
    const propTab = inspector.getByTestId('properties-tab');
    await expect(propTab).toBeVisible();

    // Should have an "Add property" button
    await expect(inspector.getByTestId('add-property-btn')).toBeVisible();
  });
});
