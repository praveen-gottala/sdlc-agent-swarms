import { test as base } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const PREFS_PATH = join(ROOT, '.agentforge-dashboard-prefs.json');
const PREFS_BACKUP = join(ROOT, '.agentforge-dashboard-prefs.json.bak');

const PET_ROOT = join(ROOT, 'fixtures', 'personal-expense-tracker');
const PAGES_YAML = join(PET_ROOT, 'agentforge/spec/pages.yaml');
const PAGES_YAML_BACKUP = join(PET_ROOT, 'agentforge/spec/pages.yaml.bak');
const DESIGN_JSON = join(PET_ROOT, 'agentforge/designs/dashboard.json');
const DESIGN_JSON_BACKUP = join(PET_ROOT, 'agentforge/designs/dashboard.json.bak');

export interface TestFixtures {
  setActiveProject: (dir: string) => void;
}

/**
 * Custom test that extends Playwright's base test with:
 * - State backup/restore for test isolation
 * - Helper to set the active project via prefs file
 */
export const test = base.extend<TestFixtures>({
  setActiveProject: async ({}, use) => {
    const setter = (dir: string) => {
      const absPath = dir.startsWith('/') ? dir : join(ROOT, dir);
      writeFileSync(PREFS_PATH, JSON.stringify({ activeProject: absPath }));
    };
    await use(setter);
  },
});

/**
 * Back up state files before the suite runs.
 * Called once per worker — since we use workers:1, this is effectively global.
 */
test.beforeAll(async () => {
  if (existsSync(PREFS_PATH)) {
    copyFileSync(PREFS_PATH, PREFS_BACKUP);
  }
  if (existsSync(PAGES_YAML)) {
    copyFileSync(PAGES_YAML, PAGES_YAML_BACKUP);
  }
  if (existsSync(DESIGN_JSON)) {
    copyFileSync(DESIGN_JSON, DESIGN_JSON_BACKUP);
  }
});

/**
 * Restore state files after the suite completes.
 */
test.afterAll(async () => {
  if (existsSync(PREFS_BACKUP)) {
    copyFileSync(PREFS_BACKUP, PREFS_PATH);
  }
  if (existsSync(PAGES_YAML_BACKUP)) {
    copyFileSync(PAGES_YAML_BACKUP, PAGES_YAML);
  }
  if (existsSync(DESIGN_JSON_BACKUP)) {
    copyFileSync(DESIGN_JSON_BACKUP, DESIGN_JSON);
  }
});

export { expect } from '@playwright/test';
export { ROOT, PET_ROOT, PREFS_PATH };
