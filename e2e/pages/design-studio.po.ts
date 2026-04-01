import type { Page } from '@playwright/test';

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
}
