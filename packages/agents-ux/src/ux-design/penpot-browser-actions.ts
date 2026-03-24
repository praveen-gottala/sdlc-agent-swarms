/**
 * @module @agentforge/agents-ux/ux-design/penpot-browser-actions
 *
 * Penpot-specific browser UI actions using Playwright.
 * All CSS selectors are isolated here — when Penpot updates its UI,
 * only this file changes.
 *
 * Each function takes a Playwright Page and returns Result<T>.
 */

import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// Playwright Page type — kept as any to avoid hard dependency
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Page = any;

// ============================================================================
// Selectors (Penpot v2.x)
// ============================================================================

/**
 * CSS selectors for Penpot UI elements.
 * Uses fallback selectors (comma-separated) to handle version differences.
 * Prefer data-testid attributes where Penpot provides them.
 */
const SELECTORS = {
  // Login page
  loginEmail: 'input[id="email"], input[name="email"], input[type="email"]',
  loginPassword: 'input[id="password"], input[name="password"], input[type="password"]',
  loginSubmit: 'input[type="submit"], button[type="submit"], button:has-text("Login")',

  // Dashboard
  dashboardContainer: '.dashboard-container, .main-content, [class*="dashboard"]',
  projectCard: '[data-testid="project-card"], .project-card, .grid-item',
  projectTitle: '.project-name, .item-name, h3',

  // Editor canvas
  canvasContainer: '.viewport, .render-area, canvas, [class*="viewport"]',
  editorWorkspace: '.workspace, [class*="workspace"]',

  // Left panel (layers)
  layersPanel: '.layers-sidebar, [data-testid="layers"], [class*="layers"]',
  layerItem: '.layer-row, .element-list-body, [class*="layer-item"]',

  // Page tabs
  pageTab: '.page-tab, [class*="page-tab"]',
  pageTabActive: '.page-tab.active, [class*="page-tab"][class*="selected"]',

  // Loading states
  loadingSpinner: '.loading, [class*="loading"], [class*="spinner"]',
  canvasLoading: '.viewport-loading, [class*="viewport"][class*="loading"]',
} as const;

// ============================================================================
// Actions
// ============================================================================

/**
 * Log in to the Penpot UI.
 * @param page - Playwright Page already navigated to the Penpot login URL
 * @param email - Penpot account email
 * @param password - Penpot account password
 */
export async function loginToPenpot(
  page: Page,
  email: string,
  password: string,
): Promise<Result<void>> {
  try {
    // Wait for login form
    await page.waitForSelector(SELECTORS.loginEmail, { timeout: 15000 });

    // Fill credentials
    await page.fill(SELECTORS.loginEmail, email);
    await page.fill(SELECTORS.loginPassword, password);

    // Submit
    await page.click(SELECTORS.loginSubmit);

    // Wait for dashboard to load (indicates successful login)
    await page.waitForSelector(SELECTORS.dashboardContainer, { timeout: 30000 });

    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Penpot login failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Navigate to a project in the Penpot dashboard by name.
 * @param page - Playwright Page on the Penpot dashboard
 * @param projectName - Name (or partial name) of the project to open
 */
export async function navigateToProject(
  page: Page,
  projectName: string,
): Promise<Result<void>> {
  try {
    // Look for project cards
    const projectCards = await page.$$(SELECTORS.projectCard);
    for (const card of projectCards) {
      const text = await card.textContent();
      if (text && text.toLowerCase().includes(projectName.toLowerCase())) {
        await card.dblclick();
        // Wait for editor workspace to load
        await page.waitForSelector(SELECTORS.editorWorkspace, { timeout: 30000 });
        return Ok(undefined);
      }
    }

    return Err({
      code: 'INVALID_STATE' as const,
      message: `Project "${projectName}" not found on dashboard`,
      recoverable: true,
    });
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Navigate to project failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Create a new project if none exists.
 * @param page - Playwright Page on the Penpot dashboard
 * @param name - Name for the new project
 */
export async function createNewProject(
  page: Page,
  name: string,
): Promise<Result<void>> {
  try {
    // Click "New Project" button
    const newProjectBtn = await page.$('button:has-text("New Project"), [class*="new-project"]');
    if (!newProjectBtn) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: 'Could not find "New Project" button on dashboard',
        recoverable: true,
      });
    }
    await newProjectBtn.click();

    // Wait for name input and type project name
    await page.waitForTimeout(1000);
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');

    // Wait for project to be created and editor to load
    await page.waitForSelector(SELECTORS.editorWorkspace, { timeout: 30000 });

    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Create project failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Open a page by name in the left panel page tabs.
 * @param page - Playwright Page in the Penpot editor
 * @param pageName - Name of the page to open
 */
export async function openPage(
  page: Page,
  pageName: string,
): Promise<Result<void>> {
  try {
    const tabs = await page.$$(SELECTORS.pageTab);
    for (const tab of tabs) {
      const text = await tab.textContent();
      if (text && text.toLowerCase().includes(pageName.toLowerCase())) {
        await tab.click();
        await waitForCanvasRender(page, 3000);
        return Ok(undefined);
      }
    }

    return Err({
      code: 'INVALID_STATE' as const,
      message: `Page "${pageName}" not found in tabs`,
      recoverable: true,
    });
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Open page failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/** Result of a canvas screenshot capture. */
export interface CanvasScreenshotResult {
  /** Base64-encoded PNG of the canvas area. */
  readonly base64: string;
}

/**
 * Take a screenshot of only the canvas area.
 * Queries the canvas bounding rect via page.evaluate() and uses clip.
 * Falls back to full-page screenshot if canvas element isn't found.
 *
 * @param page - Playwright Page in the Penpot editor
 */
export async function takeCanvasScreenshot(
  page: Page,
): Promise<Result<CanvasScreenshotResult>> {
  try {
    // Try to find the canvas/viewport element and get its bounding box
    const clip = await page.evaluate(() => {
      const selectors = ['.viewport', '.render-area', 'canvas', '[class*="viewport"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 100) {
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }
        }
      }
      return null;
    });

    const screenshotOpts: Record<string, unknown> = {};
    if (clip) {
      screenshotOpts.clip = clip;
    }

    const buffer = await page.screenshot(screenshotOpts);
    const base64 = buffer.toString('base64');
    return Ok({ base64 });
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Canvas screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/** Shape property data from Penpot's runtime. */
export interface PenpotShapeState {
  /** Name → shape property map for all children of the root. */
  readonly shapes: readonly PenpotShapeInfo[];
}

/** Basic info about a single shape. */
export interface PenpotShapeInfo {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fills: readonly Record<string, unknown>[];
  readonly strokes: readonly Record<string, unknown>[];
  readonly children?: readonly PenpotShapeInfo[];
}

/**
 * Read the actual shape state from Penpot's runtime via page.evaluate().
 * Returns the shape tree with property values (colors, sizes, positions).
 *
 * @param page - Playwright Page in the Penpot editor
 */
export async function readShapeState(
  page: Page,
): Promise<Result<PenpotShapeState>> {
  try {
    const shapes = await page.evaluate(() => {
      // Access the Penpot plugin runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const penpot = (window as any).penpot;
      if (!penpot?.currentPage?.root) {
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function serializeShape(shape: any): Record<string, unknown> {
        const result: Record<string, unknown> = {
          id: shape.id ?? '',
          name: shape.name ?? '',
          type: shape.type ?? 'unknown',
          x: shape.x ?? 0,
          y: shape.y ?? 0,
          width: shape.width ?? 0,
          height: shape.height ?? 0,
          fills: shape.fills ?? [],
          strokes: shape.strokes ?? [],
        };
        if (shape.children?.length) {
          result.children = shape.children.map(serializeShape);
        }
        return result;
      }

      return penpot.currentPage.root.children.map(serializeShape);
    });

    return Ok({ shapes: (shapes ?? []) as readonly PenpotShapeInfo[] });
  } catch (err) {
    // Shape state reading may fail if penpot runtime isn't accessible
    // via the browser page (it lives in the plugin iframe).
    // Return empty state rather than failing hard.
    return Ok({ shapes: [] });
  }
}

/**
 * Zoom the canvas to fit all content.
 * Uses the Ctrl+1 keyboard shortcut.
 *
 * @param page - Playwright Page in the Penpot editor
 */
export async function zoomToFit(page: Page): Promise<Result<void>> {
  try {
    await page.keyboard.press('Control+1');
    await page.waitForTimeout(500);
    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Zoom to fit failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Toggle the grid overlay.
 * Uses the Ctrl+' keyboard shortcut.
 *
 * @param page - Playwright Page in the Penpot editor
 */
export async function toggleGrid(page: Page): Promise<Result<void>> {
  try {
    await page.keyboard.press("Control+'");
    await page.waitForTimeout(300);
    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Toggle grid failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/** Export format options. */
export type ExportFormat = 'png' | 'svg' | 'pdf';

/**
 * Export the current page via Penpot's UI menu.
 * Falls back to screenshot if the export menu interaction fails.
 *
 * @param page - Playwright Page in the Penpot editor
 * @param format - Export format (png, svg, pdf)
 */
export async function exportPage(
  page: Page,
  format: ExportFormat = 'png',
): Promise<Result<string>> {
  try {
    // Use Ctrl+Shift+E shortcut for export (if available)
    await page.keyboard.press('Control+Shift+e');
    await page.waitForTimeout(1000);

    // Look for format selector in export dialog
    const formatBtn = await page.$(`button:has-text("${format.toUpperCase()}"), [data-format="${format}"]`);
    if (formatBtn) {
      await formatBtn.click();
    }

    // Click export/download button
    const exportBtn = await page.$('button:has-text("Export"), button:has-text("Download")');
    if (exportBtn) {
      await exportBtn.click();
      await page.waitForTimeout(2000);
      return Ok(`exported-${format}`);
    }

    // If export dialog didn't open, close any open dialog and fall back
    await page.keyboard.press('Escape');
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Export dialog not found, may need manual export',
      recoverable: true,
    });
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Wait for the canvas to finish rendering.
 * Waits for loading spinners to disappear and gives extra settle time.
 *
 * @param page - Playwright Page in the Penpot editor
 * @param timeoutMs - Maximum wait time. Default: 5000
 */
export async function waitForCanvasRender(
  page: Page,
  timeoutMs = 5000,
): Promise<Result<void>> {
  try {
    // Wait for any loading indicators to disappear
    try {
      await page.waitForSelector(SELECTORS.loadingSpinner, {
        state: 'hidden',
        timeout: timeoutMs,
      });
    } catch {
      // No spinner found — that's fine, means nothing is loading
    }

    try {
      await page.waitForSelector(SELECTORS.canvasLoading, {
        state: 'hidden',
        timeout: Math.max(timeoutMs - 2000, 1000),
      });
    } catch {
      // No canvas loading state found
    }

    // Extra settle time for canvas rendering
    await page.waitForTimeout(500);

    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'MCP_UNAVAILABLE' as const,
      message: `Wait for render timed out: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
}

/** Exported selectors for testing. */
export { SELECTORS as PENPOT_SELECTORS };
