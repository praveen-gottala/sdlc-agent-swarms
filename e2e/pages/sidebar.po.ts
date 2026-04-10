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
    const cls = (await el.getAttribute('class')) ?? '';
    return cls.includes('bg-accent-blue');
  }

  /** Open the project switcher dropdown. */
  async openProjectSwitcher() {
    await this.page.getByTestId('project-switcher').click();
  }

  /** Select a project from the open dropdown by name. */
  async selectProject(name: string) {
    await this.page.getByRole('button', { name }).click();
  }

  /** Get the currently displayed project name. */
  async getProjectName(): Promise<string> {
    return (await this.page.getByTestId('project-name').textContent()) ?? '';
  }

  /** Toggle sidebar collapse/expand. */
  async toggleCollapse() {
    await this.page.getByTestId('sidebar-toggle').click();
  }
}
