import type { Page } from '@playwright/test';

export class SidebarPO {
  constructor(private page: Page) {}

  /** Click a navigation item by its label (e.g. "Pipeline", "Design Studio"). */
  async clickNavItem(label: string) {
    const slug = label.toLowerCase().replace(/\s+/g, '-');
    await this.page.getByTestId(`nav-${slug}`).click();
  }

  /** Check whether a nav item is highlighted as active. */
  async isNavItemActive(label: string): Promise<boolean> {
    const slug = label.toLowerCase().replace(/\s+/g, '-');
    const el = this.page.getByTestId(`nav-${slug}`);
    const active = await el.getAttribute('data-active');
    return active === 'true';
  }

  /** Open the project switcher dropdown (Mantine Select). */
  async openProjectSwitcher() {
    await this.page.getByTestId('project-switcher').click();
  }

  /** Select a project from the open Mantine Select dropdown by name. */
  async selectProject(name: string) {
    await this.page.getByRole('option', { name }).click();
  }

  /** Get the currently displayed project name from the Mantine Select. */
  async getProjectName(): Promise<string> {
    const switcher = this.page.getByTestId('project-switcher');
    return switcher.evaluate((el) => {
      if (el instanceof HTMLInputElement) return el.value || el.placeholder;
      return el.textContent?.trim() || '';
    });
  }

  /** Toggle sidebar collapse/expand. */
  async toggleCollapse() {
    await this.page.getByTestId('sidebar-toggle').click();
  }
}
