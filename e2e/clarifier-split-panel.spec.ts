/**
 * E2E tests for the Clarifier /new page — split panel layout & state transitions.
 * Uses mocked SSE responses (real LLM calls are too slow for CI).
 *
 * Note: The /new page renders responsive split panels (ChatPanel + PrdPanel)
 * which may duplicate elements in the DOM. All text selectors use .first()
 * to avoid strict-mode violations.
 */

import { test, expect, PET_ROOT } from './fixtures/test-base';

function buildSSE(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

const STAGE_EVENTS = [
  { event: 'stage', data: { stage: 'contextRetriever', label: 'Loading project context...', index: 0, total: 8 } },
  { event: 'stage', data: { stage: 'prdAnalyzer', label: 'Analyzing requirements...', index: 1, total: 8 } },
];

const PRD_DRAFT = {
  title: 'Expense Tracker PRD', description: 'A personal finance app',
  features: [{ id: 'f1', name: 'Expense Logging', description: 'Log expenses with categories', priority: 'must-have' }],
  personas: [{ id: 'p1', name: 'Budget User', role: 'End user', goals: ['Track spending'] }],
  dataEntities: [{ id: 'd1', name: 'Expense', fields: [{ name: 'amount', type: 'number', required: true }] }],
  screens: [{ id: 's1', name: 'Dashboard', description: 'Main view', screenType: 'page' }],
  nfrs: [{ id: 'n1', category: 'Performance', description: 'Fast load', target: '<1s' }],
  successMetrics: [{ id: 'm1', name: 'Adoption', description: 'Monthly users', target: '1000', measurement: 'Analytics' }],
  outOfScope: ['Mobile app'],
};

const INTERRUPT_STATE = {
  mode: 'bootstrap', round: 1, maxRounds: 3,
  questions: [{ id: 'q1', gapId: 'g1', topic: 'Storage', text: 'How should expense data be stored?', type: 'multiple-choice', options: [{ label: 'SQLite', description: 'Local database', recommended: true, source: 'llm' }, { label: 'Cloud sync', description: 'Server-based', recommended: false, source: 'llm' }], priority: 1, evpiScore: 0.8 }],
  gaps: [{ id: 'g1', topic: 'Storage', description: 'No storage mechanism', category: 'missing', confidence: 0.3, deterministic: true }],
  requirement: null, assumptions: null, prdDraft: PRD_DRAFT, featurePlan: null, error: null,
};

const COMPLETE_STATE = {
  mode: 'bootstrap', round: 1, maxRounds: 3, questions: [], gaps: [],
  requirement: { prd: {}, confidence: 0.92 },
  assumptions: { entries: [{ id: 'a1', statement: 'Users have email', evidence: 'standard', confidence: 0.9, blastRadius: 'low', requiresConfirmation: false }] },
  prdDraft: PRD_DRAFT, featurePlan: null, error: null,
};

test.describe('Clarifier Split Panel', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/new');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Welcome state', () => {
    test('shows welcome hero with heading and centered input', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'What do you want to build?' }).first()).toBeVisible();
      const input = page.locator('textarea').first();
      await expect(input).toBeVisible();
    });

    test('shows placeholder suggestion in input', async ({ page }) => {
      const placeholder = page.locator('span[aria-hidden="true"]').filter({ hasText: /expense tracker|e-commerce|project management/ }).first();
      await expect(placeholder).toBeVisible({ timeout: 5000 });
    });

    test('no right panel visible in welcome state', async ({ page }) => {
      await expect(page.getByText('Pipeline').first()).not.toBeVisible();
    });
  });

  test.describe('Pipeline running → interrupt', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/clarifier', async (route) => {
        const sse = buildSSE([
          ...STAGE_EVENTS,
          { event: 'prd-draft', data: { prdDraft: PRD_DRAFT } },
          { event: 'stage', data: { stage: 'gapDetector', label: 'Detecting gaps...', index: 2, total: 8 } },
          { event: 'gaps', data: { gaps: INTERRUPT_STATE.gaps } },
          { event: 'stage', data: { stage: 'questionPrioritizer', label: 'Questions ready!', index: 3, total: 8 } },
          { event: 'result', data: { threadId: 'test-thread', interrupted: true, state: INTERRUPT_STATE } },
        ]);
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: sse,
        });
      });

      await page.locator('textarea').first().fill('A personal expense tracker');
      await page.keyboard.press('Enter');
    });

    test('right panel appears with PRD header', async ({ page }) => {
      await expect(page.getByText('Expense Tracker PRD').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Draft').first()).toBeVisible();
    });

    test('chat shows user seed and tool result messages', async ({ page }) => {
      await expect(page.getByText('A personal expense tracker').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Loading project context...').first()).toBeVisible();
      await expect(page.getByText('Completed').first()).toBeVisible();
    });

    test('question flow appears with options', async ({ page }) => {
      await expect(page.getByText('How should expense data be stored?').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('SQLite').first()).toBeVisible();
      await expect(page.getByText('Cloud sync').first()).toBeVisible();
      await expect(page.getByText('Recommended').first()).toBeVisible();
    });

    test('question shows round counter and tab', async ({ page }) => {
      await expect(page.getByText(/Round 1\/3/i).first()).toBeVisible({ timeout: 10000 });
      const tabs = page.locator('button[role="tab"]');
      await expect(tabs.first()).toBeVisible();
    });

    test('PRD sections render in document view', async ({ page }) => {
      await expect(page.getByText('Overview').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Features').first()).toBeVisible();
      await expect(page.getByText('Expense Logging').first()).toBeVisible();
      await expect(page.getByText('must-have').first()).toBeVisible();
    });
  });

  test.describe('Pipeline complete', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/api/clarifier', async (route) => {
        const sse = buildSSE([
          ...STAGE_EVENTS,
          { event: 'prd-draft', data: { prdDraft: PRD_DRAFT } },
          { event: 'stage', data: { stage: 'emitComplete', label: 'Requirements complete!', index: 7, total: 8 } },
          { event: 'result', data: { threadId: 'done-thread', interrupted: false, state: COMPLETE_STATE } },
        ]);
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: sse,
        });
      });

      await page.locator('textarea').first().fill('Build something');
      await page.keyboard.press('Enter');
    });

    test('shows approval actions on completion', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /Request Changes/ }).first()).toBeVisible();
    });

    test('shows confidence score in header', async ({ page }) => {
      await expect(page.getByText('92%').first()).toBeVisible({ timeout: 10000 });
    });

    test('request changes resets to welcome', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Request Changes/ }).first()).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /Request Changes/ }).first().click();
      await expect(page.getByRole('heading', { name: 'What do you want to build?' }).first()).toBeVisible({ timeout: 5000 });
    });

    test('all PRD sections render', async ({ page }) => {
      await expect(page.getByText('Expense Tracker PRD').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Overview').first()).toBeVisible();
      await expect(page.getByText('Features').first()).toBeVisible();
      await expect(page.getByText('Personas').first()).toBeVisible();
      await expect(page.getByText('Data Model').first()).toBeVisible();
      await expect(page.getByText('Screens').first()).toBeVisible();
      await expect(page.getByText('Non-Functional Requirements').first()).toBeVisible();
      await expect(page.getByText('Success Metrics').first()).toBeVisible();
    });
  });

  test.describe('Error handling', () => {
    test('shows error and retry when API fails', async ({ page }) => {
      await page.route('**/api/clarifier', async (route) => {
        await route.fulfill({
          status: 503,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'No Claude API authentication configured.' }),
        });
      });

      await page.locator('textarea').first().fill('Test');
      await page.keyboard.press('Enter');

      await expect(page.getByText(/No Claude API authentication/).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Try again').first()).toBeVisible();
    });
  });

  test.describe('Input submission', () => {
    test('typing and pressing Enter sends to the API', async ({ page }) => {
      let capturedInput = '';
      await page.route('**/api/clarifier', async (route) => {
        const body = route.request().postDataJSON();
        capturedInput = body?.rawInput ?? '';
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: 'event: error\ndata: {"error":"test stop","code":"TEST"}\n\n',
        });
      });

      await page.locator('textarea').first().fill('Test expense tracker');
      await page.keyboard.press('Enter');

      await expect(async () => {
        expect(capturedInput).toContain('Test expense tracker');
      }).toPass({ timeout: 5000 });
    });
  });
});
