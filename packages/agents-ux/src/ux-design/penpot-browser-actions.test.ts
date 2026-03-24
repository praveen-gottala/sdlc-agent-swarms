import { createMockPage, createMockElement } from './__test-utils__/mock-page.js';
import {
  loginToPenpot,
  navigateToProject,
  createNewProject,
  openPage,
  takeCanvasScreenshot,
  readShapeState,
  zoomToFit,
  toggleGrid,
  exportPage,
  waitForCanvasRender,
  PENPOT_SELECTORS,
} from './penpot-browser-actions.js';

describe('penpot-browser-actions', () => {
  // -----------------------------------------------------------------------
  // loginToPenpot
  // -----------------------------------------------------------------------
  describe('loginToPenpot', () => {
    it('fills email/password, clicks submit, waits for dashboard', async () => {
      const page = createMockPage();
      const result = await loginToPenpot(page, 'user@test.com', 'secret');
      expect(result.ok).toBe(true);
      expect(page.fill).toHaveBeenCalledWith(PENPOT_SELECTORS.loginEmail, 'user@test.com');
      expect(page.fill).toHaveBeenCalledWith(PENPOT_SELECTORS.loginPassword, 'secret');
      expect(page.click).toHaveBeenCalledWith(PENPOT_SELECTORS.loginSubmit);
      expect(page.waitForSelector).toHaveBeenCalledWith(
        PENPOT_SELECTORS.dashboardContainer,
        expect.objectContaining({ timeout: 30000 }),
      );
    });

    it('returns Err when login times out', async () => {
      const page = createMockPage();
      page.waitForSelector.mockRejectedValue(new Error('Timeout'));
      const result = await loginToPenpot(page, 'u@t.com', 'p');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('login failed');
    });
  });

  // -----------------------------------------------------------------------
  // navigateToProject
  // -----------------------------------------------------------------------
  describe('navigateToProject', () => {
    it('finds card by name (case insensitive) and dblclicks', async () => {
      const page = createMockPage();
      const card = createMockElement('My Dashboard Project');
      page.$$.mockResolvedValue([card]);
      const result = await navigateToProject(page, 'dashboard');
      expect(result.ok).toBe(true);
      expect(card.dblclick).toHaveBeenCalled();
    });

    it('returns Err when project not found', async () => {
      const page = createMockPage();
      page.$$.mockResolvedValue([]);
      const result = await navigateToProject(page, 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('not found');
    });
  });

  // -----------------------------------------------------------------------
  // createNewProject
  // -----------------------------------------------------------------------
  describe('createNewProject', () => {
    it('clicks button, types name, presses Enter', async () => {
      const page = createMockPage();
      const btn = createMockElement('New Project');
      page.$.mockResolvedValue(btn);
      const result = await createNewProject(page, 'Test Project');
      expect(result.ok).toBe(true);
      expect(btn.click).toHaveBeenCalled();
      expect(page.keyboard.type).toHaveBeenCalledWith('Test Project');
      expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
    });

    it('returns Err when button not found', async () => {
      const page = createMockPage();
      page.$.mockResolvedValue(null);
      const result = await createNewProject(page, 'Test');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('New Project');
    });
  });

  // -----------------------------------------------------------------------
  // openPage
  // -----------------------------------------------------------------------
  describe('openPage', () => {
    it('clicks matching tab', async () => {
      const page = createMockPage();
      const tab = createMockElement('Home Page');
      page.$$.mockResolvedValue([tab]);
      const result = await openPage(page, 'home');
      expect(result.ok).toBe(true);
      expect(tab.click).toHaveBeenCalled();
    });

    it('returns Err when page not found', async () => {
      const page = createMockPage();
      page.$$.mockResolvedValue([]);
      const result = await openPage(page, 'nonexistent');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('not found');
    });
  });

  // -----------------------------------------------------------------------
  // takeCanvasScreenshot
  // -----------------------------------------------------------------------
  describe('takeCanvasScreenshot', () => {
    it('uses clip when evaluate returns bounding rect', async () => {
      const page = createMockPage();
      const clip = { x: 0, y: 0, width: 800, height: 600 };
      page.evaluate.mockResolvedValue(clip);
      const result = await takeCanvasScreenshot(page);
      expect(result.ok).toBe(true);
      expect(page.screenshot).toHaveBeenCalledWith({ clip });
    });

    it('takes full page screenshot when evaluate returns null', async () => {
      const page = createMockPage();
      page.evaluate.mockResolvedValue(null);
      const result = await takeCanvasScreenshot(page);
      expect(result.ok).toBe(true);
      expect(page.screenshot).toHaveBeenCalledWith({});
    });

    it('returns Err when screenshot throws', async () => {
      const page = createMockPage();
      page.screenshot.mockRejectedValue(new Error('screenshot failed'));
      const result = await takeCanvasScreenshot(page);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('screenshot failed');
    });
  });

  // -----------------------------------------------------------------------
  // readShapeState
  // -----------------------------------------------------------------------
  describe('readShapeState', () => {
    it('returns shapes from evaluate', async () => {
      const page = createMockPage();
      const shapes = [{ id: '1', name: 'rect', type: 'rect', x: 0, y: 0, width: 100, height: 50, fills: [], strokes: [] }];
      page.evaluate.mockResolvedValue(shapes);
      const result = await readShapeState(page);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.shapes).toHaveLength(1);
    });

    it('returns Ok({ shapes: [] }) when runtime unavailable', async () => {
      const page = createMockPage();
      page.evaluate.mockRejectedValue(new Error('penpot not defined'));
      const result = await readShapeState(page);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.shapes).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // zoomToFit
  // -----------------------------------------------------------------------
  describe('zoomToFit', () => {
    it('presses Control+1', async () => {
      const page = createMockPage();
      const result = await zoomToFit(page);
      expect(result.ok).toBe(true);
      expect(page.keyboard.press).toHaveBeenCalledWith('Control+1');
    });
  });

  // -----------------------------------------------------------------------
  // toggleGrid
  // -----------------------------------------------------------------------
  describe('toggleGrid', () => {
    it("presses Control+'", async () => {
      const page = createMockPage();
      const result = await toggleGrid(page);
      expect(result.ok).toBe(true);
      expect(page.keyboard.press).toHaveBeenCalledWith("Control+'");
    });
  });

  // -----------------------------------------------------------------------
  // exportPage
  // -----------------------------------------------------------------------
  describe('exportPage', () => {
    it('opens dialog and clicks export button', async () => {
      const page = createMockPage();
      const exportBtn = createMockElement('Export');
      // First $ call: format button (null), second: export button
      page.$.mockResolvedValueOnce(null).mockResolvedValueOnce(exportBtn);
      const result = await exportPage(page, 'png');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toBe('exported-png');
      expect(exportBtn.click).toHaveBeenCalled();
    });

    it('returns Err when dialog not found', async () => {
      const page = createMockPage();
      page.$.mockResolvedValue(null);
      const result = await exportPage(page, 'svg');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Export dialog not found');
    });
  });

  // -----------------------------------------------------------------------
  // waitForCanvasRender
  // -----------------------------------------------------------------------
  describe('waitForCanvasRender', () => {
    it('waits for spinners to disappear', async () => {
      const page = createMockPage();
      const result = await waitForCanvasRender(page);
      expect(result.ok).toBe(true);
      expect(page.waitForSelector).toHaveBeenCalledWith(
        PENPOT_SELECTORS.loadingSpinner,
        expect.objectContaining({ state: 'hidden' }),
      );
    });

    it('still returns Ok when no spinners exist', async () => {
      const page = createMockPage();
      // waitForSelector throws for "hidden" check because element doesn't exist
      page.waitForSelector.mockRejectedValue(new Error('no element'));
      const result = await waitForCanvasRender(page);
      expect(result.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // PENPOT_SELECTORS
  // -----------------------------------------------------------------------
  describe('PENPOT_SELECTORS', () => {
    it('has expected keys', () => {
      const expectedKeys = [
        'loginEmail', 'loginPassword', 'loginSubmit',
        'dashboardContainer', 'projectCard', 'projectTitle',
        'canvasContainer', 'editorWorkspace',
        'layersPanel', 'layerItem',
        'pageTab', 'pageTabActive',
        'loadingSpinner', 'canvasLoading',
      ];
      for (const key of expectedKeys) {
        expect(PENPOT_SELECTORS).toHaveProperty(key);
      }
    });
  });
});
