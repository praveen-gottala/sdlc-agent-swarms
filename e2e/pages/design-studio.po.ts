import { type Page, expect } from '@playwright/test';

export class DesignStudioPO {
  readonly page: Page;
  constructor(page: Page) {
    this.page = page;
  }

  /** Get the list of page IDs visible in the page registry. */
  async getPageList(): Promise<string[]> {
    const buttons = this.page.locator('[data-testid^="page-"]');
    const count = await buttons.count();
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const testId = await buttons.nth(i).getAttribute('data-testid');
      if (testId) ids.push(testId.replace('page-', ''));
    }
    return ids;
  }

  /** Click a page in the registry by its ID. */
  async selectPage(id: string) {
    await this.page.getByTestId(`page-${id}`).click();
  }

  /** Click the "+ New page" button. */
  async clickCreateNewPage() {
    await this.page.getByTestId('create-page-btn').click();
  }

  /** Check whether the design iframe is visible. */
  async isCanvasIframeVisible(): Promise<boolean> {
    const iframe = this.page.getByTestId('design-iframe');
    return iframe.isVisible();
  }

  /** Wait for the design iframe to be attached and loaded (allows time for auto-start). */
  async waitForIframeReady() {
    await this.page.getByTestId('design-iframe').waitFor({ state: 'attached', timeout: 30000 });
  }

  /** Check if the inspector panel is visible. */
  async isInspectorVisible(): Promise<boolean> {
    return this.page.getByTestId('design-inspector').isVisible();
  }

  /** Get the canvas state — returns 'iframe' if the iframe is showing, 'empty' otherwise. */
  async getCanvasState(): Promise<'iframe' | 'empty'> {
    const visible = await this.isCanvasIframeVisible();
    return visible ? 'iframe' : 'empty';
  }

  /** Activate edit mode by clicking the Edit button if inspector is not visible. */
  async activateEditMode(): Promise<void> {
    const inspector = this.page.getByTestId('design-inspector');
    if (await inspector.isVisible()) return;
    const editBtn = this.page.locator('[aria-label="Edit"]');
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();
    await expect(inspector).toBeVisible({ timeout: 5_000 });
  }

  /** Expand the Chat zone in the inspector (activates edit mode if needed). */
  async clickChatTab(): Promise<void> {
    await this.activateEditMode();
  }

  /** Navigate to the design page and select a specific page by ID. */
  async navigateToPage(pageId: string): Promise<void> {
    await this.page.goto('/design', { waitUntil: 'domcontentloaded' });
    await this.page.locator('[data-testid^="page-"]').first().waitFor({ state: 'attached', timeout: 15_000 });
    await this.selectPage(pageId);
    await expect(this.page).toHaveURL(new RegExp(`page=${pageId}`), { timeout: 5_000 });
  }

  /** Get a FrameLocator for the design renderer iframe. */
  get rendererFrame() {
    return this.page.frameLocator('[data-testid="design-iframe"]');
  }

  /** Wait for the renderer to report ready via the status API. */
  async waitForRendererReady(timeoutMs = 30_000): Promise<void> {
    await this.page.getByTestId('design-iframe').waitFor({ state: 'attached', timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await this.page.request.get('/api/renderer/status').catch(() => null);
      if (res?.ok()) {
        const json = await res.json().catch(() => null);
        if (json?.status === 'ready') return;
      }
      await this.page.waitForTimeout(1000);
    }
  }

  /** Fill the chat textarea with a message. */
  async fillChatMessage(msg: string): Promise<void> {
    await this.page.getByTestId('chat-textarea').fill(msg);
  }

  /** Click the Send button in the chat panel. */
  async clickChatSend(): Promise<void> {
    await this.page.getByTestId('chat-send-btn').click();
  }
}
