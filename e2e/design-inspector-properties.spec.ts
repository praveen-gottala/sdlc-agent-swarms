import { test, expect, PET_ROOT } from './fixtures/test-base';
import { SidebarPO } from './pages/sidebar.po';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Inspector Properties', () => {
  let sidebar: SidebarPO;
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    sidebar = new SidebarPO(page);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('design-inspector').waitFor({ state: 'attached', timeout: 10000 });

    // Select the dashboard page (rendered) so the iframe loads
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });
  });

  /**
   * Helper: click the first element in the design iframe to select a node.
   * Returns the selected node's ID so tests can locate it in the iframe.
   */
  async function selectFirstCanvasNode(page: import('@playwright/test').Page): Promise<string> {
    await studio.waitForIframeReady();

    const iframeLocator = page.frameLocator('[data-testid="design-iframe"]');
    const firstNode = iframeLocator.locator('[data-node]').first();
    await firstNode.waitFor({ state: 'visible', timeout: 20000 });

    // Click and wait for inspector to populate (properties tab content).
    const inspector = page.getByTestId('design-inspector');
    const propertiesTab = inspector.getByTestId('properties-tab');
    let selected = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await firstNode.click();
      try {
        await propertiesTab.waitFor({ state: 'visible', timeout: 5000 });
        selected = true;
        break;
      } catch {
        // Retry — bridge may not be ready yet
      }
    }

    if (!selected) {
      throw new Error('selectFirstCanvasNode: properties tab did not appear after 3 attempts');
    }

    // Read the selected node ID from the inspector
    const nodeIdText = await inspector.locator('.font-mono.text-xs.text-accent-blue').textContent();
    return nodeIdText?.trim() ?? '';
  }

  /**
   * Helper: get inline style of the selected node inside the iframe.
   */
  function getIframeNodeStyle(page: import('@playwright/test').Page, nodeId: string, cssProp: string) {
    const iframeLocator = page.frameLocator('[data-testid="design-iframe"]');
    return iframeLocator.locator(`[data-node="${nodeId}"]`).evaluate(
      (el, prop) => (el as HTMLElement).style.getPropertyValue(prop),
      cssProp,
    );
  }

  /**
   * Helper: find a property row by its CSS label.
   */
  function findPropertyRow(page: import('@playwright/test').Page, cssLabel: string) {
    const inspector = page.getByTestId('design-inspector');
    return inspector.locator(`[data-testid="properties-tab"] .font-mono`).filter({ hasText: cssLabel }).locator('..');
  }

  /**
   * Helper: add a property via the [+ Add property] button.
   */
  async function addProperty(page: import('@playwright/test').Page, cssLabel: string) {
    const inspector = page.getByTestId('design-inspector');
    await inspector.getByTestId('add-property-btn').click();
    const select = inspector.getByTestId('add-property-select');
    await select.waitFor({ state: 'visible', timeout: 3000 });
    // Find the option with the matching CSS label text
    await select.selectOption({ label: cssLabel });
  }

  test('Property list shows node active properties with CSS labels', async ({ page }) => {
    await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');
    const tab = inspector.getByTestId('properties-tab');
    await expect(tab).toBeVisible();

    // Ensure flex-direction is present (add if node doesn't have it)
    const dirInput = await ensureProperty(page, 'prop-layout-dir', 'flex-direction');
    await expect(dirInput).toBeVisible();

    // CSS label should be visible in the row
    const dirRow = tab.locator('[data-testid="prop-row-layout-dir"]');
    await expect(dirRow.locator('.font-mono').first()).toHaveText('flex-direction');
  });

  test('flex-direction change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const dirSelect = await ensureProperty(page, 'prop-layout-dir', 'flex-direction');

    await dirSelect.selectOption('column');
    const flexDir = await getIframeNodeStyle(page, nodeId, 'flex-direction');
    expect(flexDir).toBe('column');

    await dirSelect.selectOption('row');
    const flexDirBack = await getIframeNodeStyle(page, nodeId, 'flex-direction');
    expect(flexDirBack).toBe('row');
  });

  test('gap change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('24');

    const gap = await getIframeNodeStyle(page, nodeId, 'gap');
    expect(gap).toBe('24px');
  });

  test('padding-x change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const pxInput = await ensureProperty(page, 'prop-layout-px', 'padding-x');
    await pxInput.fill('20');

    const pLeft = await getIframeNodeStyle(page, nodeId, 'padding-left');
    const pRight = await getIframeNodeStyle(page, nodeId, 'padding-right');
    expect(pLeft).toBe('20px');
    expect(pRight).toBe('20px');
  });

  test('padding-y change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const pyInput = await ensureProperty(page, 'prop-layout-py', 'padding-y');
    await pyInput.fill('12');

    const pTop = await getIframeNodeStyle(page, nodeId, 'padding-top');
    const pBottom = await getIframeNodeStyle(page, nodeId, 'padding-bottom');
    expect(pTop).toBe('12px');
    expect(pBottom).toBe('12px');
  });

  test('color change via color input reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    // Color might need to be added if not present on node
    let colorInput = inspector.getByTestId('prop-color');
    if (!(await colorInput.isVisible().catch(() => false))) {
      await addProperty(page, 'color');
      colorInput = inspector.getByTestId('prop-color');
    }

    await colorInput.fill('#ff0000');
    const color = await getIframeNodeStyle(page, nodeId, 'color');
    expect(color).toBe('rgb(255, 0, 0)');

    // Verify swatch shows the hex
    const swatch = inspector.getByTestId('prop-color-swatch');
    await expect(swatch).toBeVisible();
  });

  test('background change via color input reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    let bgInput = inspector.getByTestId('prop-background');
    if (!(await bgInput.isVisible().catch(() => false))) {
      await addProperty(page, 'background');
      bgInput = inspector.getByTestId('prop-background');
    }

    await bgInput.fill('#00ff00');
    const bg = await getIframeNodeStyle(page, nodeId, 'background-color');
    expect(bg).toBe('rgb(0, 255, 0)');

    const swatch = inspector.getByTestId('prop-background-swatch');
    await expect(swatch).toBeVisible();
  });

  test('font-weight change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    let weightInput = inspector.getByTestId('prop-weight');
    if (!(await weightInput.isVisible().catch(() => false))) {
      await addProperty(page, 'font-weight');
      weightInput = inspector.getByTestId('prop-weight');
    }

    await weightInput.fill('700');
    const fontWeight = await getIframeNodeStyle(page, nodeId, 'font-weight');
    expect(fontWeight).toBe('700');
  });

  test('text-align change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    let taSelect = inspector.getByTestId('prop-textAlign');
    if (!(await taSelect.isVisible().catch(() => false))) {
      await addProperty(page, 'text-align');
      taSelect = inspector.getByTestId('prop-textAlign');
    }

    await taSelect.selectOption('center');
    const textAlign = await getIframeNodeStyle(page, nodeId, 'text-align');
    expect(textAlign).toBe('center');

    await taSelect.selectOption('right');
    const textAlignRight = await getIframeNodeStyle(page, nodeId, 'text-align');
    expect(textAlignRight).toBe('right');
  });

  test('border-radius change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    let radiusInput = inspector.getByTestId('prop-radius');
    if (!(await radiusInput.isVisible().catch(() => false))) {
      await addProperty(page, 'border-radius');
      radiusInput = inspector.getByTestId('prop-radius');
    }

    await radiusInput.fill('12');
    const radius = await getIframeNodeStyle(page, nodeId, 'border-radius');
    expect(radius).toBe('12px');
  });

  /**
   * Helper: ensure a property input is visible, adding it if not present.
   * Returns the input locator.
   */
  async function ensureProperty(
    page: import('@playwright/test').Page,
    testId: string,
    cssLabel: string,
  ) {
    const inspector = page.getByTestId('design-inspector');
    const input = inspector.getByTestId(testId);
    if (!(await input.isVisible().catch(() => false))) {
      await addProperty(page, cssLabel);
    }
    await expect(input).toBeVisible({ timeout: 5000 });
    return input;
  }

  test('justify-content change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const justifySelect = await ensureProperty(page, 'prop-layout-justify', 'justify-content');

    await justifySelect.selectOption('center');
    const jc = await getIframeNodeStyle(page, nodeId, 'justify-content');
    expect(jc).toBe('center');

    await justifySelect.selectOption('between');
    const jcBetween = await getIframeNodeStyle(page, nodeId, 'justify-content');
    expect(jcBetween).toBe('space-between');
  });

  test('align-items change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const alignSelect = await ensureProperty(page, 'prop-layout-align', 'align-items');

    await alignSelect.selectOption('stretch');
    const ai = await getIframeNodeStyle(page, nodeId, 'align-items');
    expect(ai).toBe('stretch');

    await alignSelect.selectOption('center');
    const aiCenter = await getIframeNodeStyle(page, nodeId, 'align-items');
    expect(aiCenter).toBe('center');
  });

  test('padding-top change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const ptInput = await ensureProperty(page, 'prop-layout-pt', 'padding-top');
    await ptInput.fill('14');

    const pt = await getIframeNodeStyle(page, nodeId, 'padding-top');
    expect(pt).toBe('14px');
  });

  test('padding-bottom change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const pbInput = await ensureProperty(page, 'prop-layout-pb', 'padding-bottom');
    await pbInput.fill('18');

    const pb = await getIframeNodeStyle(page, nodeId, 'padding-bottom');
    expect(pb).toBe('18px');
  });

  test('margin-x change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const mxInput = await ensureProperty(page, 'prop-layout-mx', 'margin-x');
    await mxInput.fill('16');

    const ml = await getIframeNodeStyle(page, nodeId, 'margin-left');
    const mr = await getIframeNodeStyle(page, nodeId, 'margin-right');
    expect(ml).toBe('16px');
    expect(mr).toBe('16px');
  });

  test('margin-y change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const myInput = await ensureProperty(page, 'prop-layout-my', 'margin-y');
    await myInput.fill('8');

    const mt = await getIframeNodeStyle(page, nodeId, 'margin-top');
    const mb = await getIframeNodeStyle(page, nodeId, 'margin-bottom');
    expect(mt).toBe('8px');
    expect(mb).toBe('8px');
  });

  test('margin-top change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const mtInput = await ensureProperty(page, 'prop-layout-mt', 'margin-top');
    await mtInput.fill('10');

    const mt = await getIframeNodeStyle(page, nodeId, 'margin-top');
    expect(mt).toBe('10px');
  });

  test('margin-bottom change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const mbInput = await ensureProperty(page, 'prop-layout-mb', 'margin-bottom');
    await mbInput.fill('6');

    const mb = await getIframeNodeStyle(page, nodeId, 'margin-bottom');
    expect(mb).toBe('6px');
  });

  test('margin-left change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const mlInput = await ensureProperty(page, 'prop-layout-ml', 'margin-left');
    await mlInput.fill('5');

    const ml = await getIframeNodeStyle(page, nodeId, 'margin-left');
    expect(ml).toBe('5px');
  });

  test('margin-right change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const mrInput = await ensureProperty(page, 'prop-layout-mr', 'margin-right');
    await mrInput.fill('7');

    const mr = await getIframeNodeStyle(page, nodeId, 'margin-right');
    expect(mr).toBe('7px');
  });

  test('width change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const widthInput = await ensureProperty(page, 'prop-width', 'width');

    // Numeric value → px
    await widthInput.fill('200');
    const w = await getIframeNodeStyle(page, nodeId, 'width');
    expect(w).toBe('200px');

    // "fill" → flex: 1
    await widthInput.fill('fill');
    const flex = await getIframeNodeStyle(page, nodeId, 'flex');
    expect(flex).toMatch(/^1(\s|$)/);
  });

  test('height change reflected on iframe', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    const heightInput = await ensureProperty(page, 'prop-height', 'height');
    await heightInput.fill('48');

    const h = await getIframeNodeStyle(page, nodeId, 'height');
    expect(h).toBe('48px');
  });

  test('font-family input accepts token value', async ({ page }) => {
    await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');
    const typoInput = await ensureProperty(page, 'prop-typography', 'font-family');

    await typoInput.fill('heading-1');
    await expect(typoInput).toHaveValue('heading-1');
    // typography → no live CSS (requires token resolution), just verify input works
  });

  test('box-shadow input accepts token alias', async ({ page }) => {
    await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');
    const shadowInput = await ensureProperty(page, 'prop-shadow', 'box-shadow');

    await shadowInput.fill('md');
    await expect(shadowInput).toHaveValue('md');
    // shadow → no live CSS (requires token resolution), just verify input works
  });

  test('Add property via [+] menu', async ({ page }) => {
    await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    // Add padding-top if not present
    const ptRow = inspector.getByTestId('prop-row-layout-pt');
    if (await ptRow.isVisible().catch(() => false)) {
      // Already present, remove it first
      await inspector.getByTestId('prop-remove-layout-pt').click();
      await expect(ptRow).not.toBeVisible();
    }

    // Now add it
    await addProperty(page, 'padding-top');

    // Verify new row appears
    await expect(inspector.getByTestId('prop-row-layout-pt')).toBeVisible();
  });

  test('Remove property via [x] button', async ({ page }) => {
    await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    // Find a property row that exists (padding-x should exist on most nodes)
    const pxRow = inspector.getByTestId('prop-row-layout-px');
    if (!(await pxRow.isVisible().catch(() => false))) {
      // If not present, add it first
      await addProperty(page, 'padding-x');
      await expect(pxRow).toBeVisible();
    }

    // Click remove
    await inspector.getByTestId('prop-remove-layout-px').click();

    // Row should disappear
    await expect(pxRow).not.toBeVisible();
  });

  test('Property changes persist after save', async ({ page }) => {
    test.setTimeout(60000);
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    // Set gap to 32
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('32');
    await expect(gapInput).toHaveValue('32');

    // Click Save
    const saveBtn = page.getByTestId('save-spec-btn');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await expect(saveBtn).toHaveText('Save', { timeout: 5000 });

    // Reload the page
    await page.reload();
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('design-inspector').waitFor({ state: 'attached', timeout: 10000 });
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    // Re-select the same node
    await selectFirstCanvasNode(page);

    // Verify the gap value persisted
    const gapAfter = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await expect(gapAfter).toHaveValue('32');
  });

  test('Multiple properties changed together reflect correctly', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);

    // Ensure all three properties exist
    const pxInput = await ensureProperty(page, 'prop-layout-px', 'padding-x');
    await pxInput.fill('20');

    const pyInput = await ensureProperty(page, 'prop-layout-py', 'padding-y');
    await pyInput.fill('10');

    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('16');

    // Verify all three on iframe
    const pLeft = await getIframeNodeStyle(page, nodeId, 'padding-left');
    const pTop = await getIframeNodeStyle(page, nodeId, 'padding-top');
    const gap = await getIframeNodeStyle(page, nodeId, 'gap');

    expect(pLeft).toBe('20px');
    expect(pTop).toBe('10px');
    expect(gap).toBe('16px');
  });

  test('Saved property changes are reflected on iframe after page reload', async ({ page }) => {
    test.setTimeout(60000);
    const nodeId = await selectFirstCanvasNode(page);

    const inspector = page.getByTestId('design-inspector');

    // Set gap to 28
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('28');
    await expect(gapInput).toHaveValue('28');

    // Add margin-x and set to 11
    const mxInput = await ensureProperty(page, 'prop-layout-mx', 'margin-x');
    await mxInput.fill('11');
    await expect(mxInput).toHaveValue('11');

    // Verify live preview works before save
    const gapLive = await getIframeNodeStyle(page, nodeId, 'gap');
    expect(gapLive).toBe('28px');
    const mlLive = await getIframeNodeStyle(page, nodeId, 'margin-left');
    expect(mlLive).toBe('11px');

    // Save
    const saveBtn = page.getByTestId('save-spec-btn');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await expect(saveBtn).toHaveText('Save', { timeout: 5000 });

    // Full page reload
    await page.reload();
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('design-inspector').waitFor({ state: 'attached', timeout: 10000 });
    await studio.selectPage('dashboard');
    await expect(page).toHaveURL(/\/design\?page=dashboard/, { timeout: 5000 });

    // Wait for iframe to fully render
    await studio.waitForIframeReady();
    const iframeLocator = page.frameLocator('[data-testid="design-iframe"]');
    const reloadedNode = iframeLocator.locator(`[data-node="${nodeId}"]`);
    await reloadedNode.waitFor({ state: 'visible', timeout: 20000 });

    // Verify the inspector shows the persisted values after reload
    await selectFirstCanvasNode(page);
    const gapInspector = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await expect(gapInspector).toHaveValue('28');
    const mxInspector = await ensureProperty(page, 'prop-layout-mx', 'margin-x');
    await expect(mxInspector).toHaveValue('11');
  });

  test('Revert element restores single node to last saved state', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);
    const inspector = page.getByTestId('design-inspector');

    // Read original gap value
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    const originalGap = await gapInput.inputValue();

    // Change gap to something different
    await gapInput.fill('99');
    await expect(gapInput).toHaveValue('99');

    // Verify iframe picked up the change
    const gapLive = await getIframeNodeStyle(page, nodeId, 'gap');
    expect(gapLive).toBe('99px');

    // Click "Revert element"
    const revertBtn = page.getByTestId('revert-node-btn');
    await expect(revertBtn).toBeVisible({ timeout: 3000 });
    await revertBtn.click();

    // Re-select the same node (revert triggers loadSpec which re-renders iframe)
    await selectFirstCanvasNode(page);

    // Gap should be back to original
    const gapAfter = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await expect(gapAfter).toHaveValue(originalGap);
  });

  test('Revert all via action bar restores entire design to last saved state', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);
    const inspector = page.getByTestId('design-inspector');

    // Read original gap value
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    const originalGap = await gapInput.inputValue();

    // Change gap
    await gapInput.fill('77');
    await expect(gapInput).toHaveValue('77');

    // "Save *" should indicate unsaved changes and "Revert" button should appear
    const saveBtn = page.getByTestId('save-spec-btn');
    await expect(saveBtn).toHaveText('Save *', { timeout: 3000 });
    const revertAllBtn = page.getByTestId('revert-spec-btn');
    await expect(revertAllBtn).toBeVisible({ timeout: 3000 });

    // Click Revert (full)
    await revertAllBtn.click();

    // Save button should go back to "Save" (no asterisk) and Revert disappears
    await expect(saveBtn).toHaveText('Save', { timeout: 3000 });
    await expect(revertAllBtn).not.toBeVisible({ timeout: 3000 });

    // Re-select the node and verify gap restored
    await selectFirstCanvasNode(page);
    const gapAfter = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await expect(gapAfter).toHaveValue(originalGap);
  });

  test('Save then revert element has correct baseline', async ({ page }) => {
    const nodeId = await selectFirstCanvasNode(page);
    const inspector = page.getByTestId('design-inspector');

    // Change gap and save
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('55');
    const saveBtn = page.getByTestId('save-spec-btn');
    await saveBtn.click();
    await expect(saveBtn).toHaveText('Save', { timeout: 5000 });

    // Now change gap again without saving
    await gapInput.fill('88');
    await expect(gapInput).toHaveValue('88');

    // Revert element — should go back to 55 (saved), not the original
    const revertBtn = page.getByTestId('revert-node-btn');
    await expect(revertBtn).toBeVisible({ timeout: 3000 });
    await revertBtn.click();

    await selectFirstCanvasNode(page);
    const gapAfter = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await expect(gapAfter).toHaveValue('55');
  });

  test('Save shows success toast notification', async ({ page }) => {
    await selectFirstCanvasNode(page);
    const inspector = page.getByTestId('design-inspector');

    // Make a change so Save does something
    const gapInput = await ensureProperty(page, 'prop-layout-gap', 'gap');
    await gapInput.fill('42');

    // Click Save
    const saveBtn = page.getByTestId('save-spec-btn');
    await saveBtn.click();

    // Toast should appear
    const toast = page.locator('.animate-fade-toast');
    await expect(toast).toBeVisible({ timeout: 3000 });
    await expect(toast).toContainText('Design saved');
  });
});
