import type { Page } from '@playwright/test';

export class OnboardingPO {
  constructor(readonly page: Page) {}

  /** Step 1: Fill in project name. */
  async fillName(name: string) {
    await this.page.getByTestId('onboarding-name').fill(name);
  }

  /** Step 1: Fill in project description. */
  async fillDescription(desc: string) {
    await this.page.getByTestId('onboarding-desc').fill(desc);
  }

  /** Click the "Next" or "Skip" button (used across multiple steps). */
  async clickNext() {
    await this.page.getByTestId('onboarding-next').click();
  }

  /** Step 3: Click "Use defaults (no AI)" to skip LLM design generation. */
  async useDefaults() {
    await this.page.getByTestId('onboarding-use-defaults').click();
  }

  /** Step 3 preview: Wait for the design preview iframe to load. */
  async waitForDesignPreview() {
    await this.page.locator('iframe[title="Design preview"]').waitFor({ state: 'attached', timeout: 15000 });
  }

  /** Step 3 preview: Select a design option by dispatching the postMessage the iframe would send. */
  async selectDesignOption() {
    // The iframe button calls window.parent.postMessage with this payload.
    // Dispatching it directly avoids viewport scrolling issues in the tall iframe.
    await this.page.evaluate(() => {
      window.postMessage(
        { type: 'design-option-selected', optionIndex: 0, source: 'agentforge-design-preview' },
        '*',
      );
    });
    // Wait for the "Selected:" confirmation to appear
    await this.page.getByText(/Selected:/).waitFor({ timeout: 5000 });
  }

  /** Step 4: Fill in target audience. */
  async fillAudience(audience: string) {
    await this.page.getByTestId('onboarding-audience').fill(audience);
  }

  /** Step 4: Select a component library option. */
  async selectLibrary(lib: 'shadcn/ui' | 'Material UI' | 'Custom') {
    await this.page.getByRole('button', { name: lib }).click();
  }

  /** Step 4: Select a color scheme. */
  async selectColorScheme(scheme: 'light' | 'dark' | 'both') {
    await this.page.getByRole('button', { name: scheme, exact: true }).click();
  }

  /** Step 5: Click "Create project" button. */
  async clickCreate() {
    await this.page.getByTestId('onboarding-create').click();
  }

  /** Get current step number from the "Step X of Y" text. */
  async getCurrentStep(): Promise<number> {
    const text = await this.page.getByText(/Step \d+ of \d+/).textContent();
    const match = text?.match(/Step (\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /** Locator for the logs toggle button. */
  getLogsToggle() {
    return this.page.getByTestId('logs-toggle');
  }

  /** Click the logs toggle to expand the panel. */
  async expandLogs() {
    await this.getLogsToggle().click();
  }

  /** Return locators for log entries inside the expanded panel. */
  getLogEntries() {
    return this.page.getByTestId('log-entry');
  }

  /** Extract the count from "Logs (N)" text. */
  async getLogsCount(): Promise<number> {
    const text = await this.getLogsToggle().textContent();
    const match = text?.match(/Logs \((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
