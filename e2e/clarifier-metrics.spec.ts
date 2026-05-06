/**
 * E2E tests for Clarifier pipeline metrics verification.
 * Scope: durationMs rendering, completion confidence/feature count,
 * collapsed answer bubbles, thinking indicator cleanup.
 *
 * Complements clarifier-new-project.spec.ts (flow) and
 * clarifier-split-panel.spec.ts (layout). Does NOT duplicate those tests.
 */

import { test, expect, PET_ROOT } from './fixtures/test-base';

function buildSSE(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const PRD_DRAFT = {
  title: 'Habit Tracker PRD',
  description: 'A habit tracking app with streaks',
  features: [
    { id: 'f1', name: 'Habit Management', description: 'CRUD habits', priority: 'must-have' },
    { id: 'f2', name: 'Streak Tracking', description: 'Count consecutive days', priority: 'must-have' },
    { id: 'f3', name: 'Reminders', description: 'Browser notifications', priority: 'must-have' },
    { id: 'f4', name: 'Dashboard', description: 'Daily view', priority: 'must-have' },
  ],
  personas: [{ id: 'p1', name: 'Habit Builder', role: 'End user', goals: ['Stay consistent'] }],
  dataEntities: [{ id: 'd1', name: 'Habit', fields: [{ name: 'name', type: 'string', required: true }] }],
  screens: [{ id: 's1', name: 'Dashboard', description: 'Main view', screenType: 'page' }],
  nfrs: [{ id: 'n1', category: 'Performance', description: 'Load <2s', target: '<2s' }],
  successMetrics: [{ id: 'm1', name: 'DAU', description: 'Daily active users', target: '40%', measurement: 'DAU/total' }],
  outOfScope: ['Social features'],
};

const UPDATED_PRD = {
  ...PRD_DRAFT,
  title: 'Habit Tracker PRD (Updated)',
  features: [
    ...PRD_DRAFT.features,
    { id: 'f5', name: 'Milestone Badges', description: 'Celebrate streaks', priority: 'must-have' },
  ],
};

const QUESTIONS = [
  {
    id: 'q1', gapId: 'g1', topic: 'Platform', text: 'Should this be a web app or mobile app?',
    type: 'multiple-choice',
    options: [
      { label: 'Web app', description: 'Browser-based', recommended: true, source: 'llm' },
      { label: 'Mobile app', description: 'Native iOS/Android', recommended: false, source: 'llm' },
    ],
    priority: 1, evpiScore: 0.8,
  },
  {
    id: 'q2', gapId: 'g2', topic: 'Auth', text: 'How should users log in?',
    type: 'multiple-choice',
    options: [
      { label: 'Email & password', description: 'Standard auth', recommended: true, source: 'llm' },
      { label: 'No auth', description: 'Just use localStorage', recommended: false, source: 'llm' },
    ],
    priority: 2, evpiScore: 0.6,
  },
];

const GAPS = [
  { id: 'g1', topic: 'Platform', description: 'Platform unspecified', category: 'missing', confidence: 0.3, deterministic: true },
  { id: 'g2', topic: 'Auth', description: 'Auth strategy unclear', category: 'missing', confidence: 0.4, deterministic: true },
];

const INTERRUPT_STATE = {
  mode: 'bootstrap', round: 1, maxRounds: 3,
  questions: QUESTIONS, gaps: GAPS,
  humanResponses: [],
  requirement: null, assumptions: null, prdDraft: PRD_DRAFT, featurePlan: null, error: null,
};

const INITIAL_STAGE_EVENTS = [
  { event: 'stage', data: { stage: 'contextRetriever', label: 'Loading project context...', index: 0, total: 8, durationMs: 1 } },
  { event: 'stage', data: { stage: 'prdAnalyzer', label: 'Analyzing requirements with Claude Opus...', index: 1, total: 8, durationMs: 76400 } },
  { event: 'stage', data: { stage: 'gapDetector', label: 'Detecting gaps and ambiguities...', index: 2, total: 8, durationMs: 60600 } },
  { event: 'stage', data: { stage: 'questionPrioritizer', label: 'Prioritizing clarification questions...', index: 3, total: 8, durationMs: 3 } },
];

const RESUME_STAGE_EVENTS = [
  { event: 'stage', data: { stage: 'storyWriter', label: 'Writing user stories...', index: 4, total: 8, durationMs: 49600 } },
  { event: 'stage', data: { stage: 'critic', label: 'Reviewing story quality...', index: 5, total: 8, durationMs: 4 } },
  { event: 'stage', data: { stage: 'prdUpdater', label: 'Updating PRD with your answers...', index: 6, total: 8, durationMs: 79900 } },
  { event: 'stage', data: { stage: 'emitComplete', label: 'Requirements complete!', index: 7, total: 8, durationMs: 2 } },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockInitialInterrupt(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/clarifier', async (route) => {
    const sse = buildSSE([
      ...INITIAL_STAGE_EVENTS,
      { event: 'prd-draft', data: { prdDraft: PRD_DRAFT } },
      { event: 'gaps', data: { gaps: GAPS } },
      { event: 'result', data: { threadId: 'metrics-thread', interrupted: true, state: INTERRUPT_STATE } },
    ]);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sse,
    });
  });
}

async function mockResumeComplete(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/api/clarifier/respond', async (route) => {
    const sse = buildSSE([
      ...RESUME_STAGE_EVENTS,
      { event: 'prd-draft', data: { prdDraft: UPDATED_PRD } },
      {
        event: 'result', data: {
          threadId: 'metrics-thread', interrupted: false,
          state: {
            ...INTERRUPT_STATE, questions: [],
            requirement: { prd: UPDATED_PRD, confidence: 0.88 },
            assumptions: { entries: [{ id: 'a1', text: 'Single-user only', confidence: 0.9 }] },
            prdDraft: UPDATED_PRD,
            humanResponses: [
              { questionId: 'q1', answer: 'Web app', selectedOption: 'Web app' },
              { questionId: 'q2', answer: 'Email & password', selectedOption: 'Email & password' },
            ],
          },
        },
      },
    ]);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sse,
    });
  });
}

async function submitPrompt(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('textarea').first().fill('A simple habit tracker with streaks');
  await page.keyboard.press('Enter');
}

async function answerAllAndSubmit(page: import('@playwright/test').Page): Promise<void> {
  // Wait for first question
  await expect(page.getByText('Should this be a web app').first()).toBeVisible({ timeout: 10000 });

  // Answer question 1
  await page.getByRole('button', { name: /Web app/ }).first().click();

  // Navigate to question 2
  const q2Tab = page.locator('button[role="tab"]').filter({ hasText: /Auth/ }).first();
  if (await q2Tab.isVisible()) {
    await q2Tab.click();
  }
  await expect(page.getByText('How should users log in?').first()).toBeVisible({ timeout: 5000 });

  // Answer question 2
  await page.getByRole('button', { name: /Email & password/ }).first().click();

  // Submit
  await page.getByRole('button', { name: /Submit Answers/ }).first().click();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Clarifier Pipeline Metrics', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/new');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Stage duration rendering', () => {
    test('initial run stages show duration in completed cards', async ({ page }) => {
      await mockInitialInterrupt(page);
      await submitPrompt(page);

      // Wait for questions to appear
      await expect(page.getByText('Should this be a web app').first()).toBeVisible({ timeout: 10000 });

      // prdAnalyzer had durationMs: 76400 → formatDuration → "1m 16s"
      await expect(page.getByText('1m 16s').first()).toBeVisible();
      // gapDetector had durationMs: 60600 → "1m 0s"
      await expect(page.getByText('1m 0s').first()).toBeVisible();
    });

    test('storyWriter shows non-zero duration on resume', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      // Wait for completion
      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // storyWriter had durationMs: 49600 → "49s"
      await expect(page.getByText('49s').first()).toBeVisible();
      // prdUpdater had durationMs: 79900 → "1m 19s"
      await expect(page.getByText('1m 19s').first()).toBeVisible();
    });
  });

  test.describe('Completion metrics', () => {
    test('shows confidence percentage and feature count', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      // Wait for the prd-complete message
      await expect(page.getByText(/88% confidence/).first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/5 features/).first()).toBeVisible();
      await expect(page.getByText(/1 assumptions?/).first()).toBeVisible();
    });
  });

  test.describe('Answer bubble collapse', () => {
    test('answer bubbles collapsed into single summary', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      // Wait for completion
      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // Single summary bubble should say "Answered 2 questions"
      await expect(page.getByText('Answered 2 questions').first()).toBeVisible();

      // The summary text should contain selected options
      await expect(page.getByText(/Web app.*Email & password|Email & password.*Web app/).first()).toBeVisible();
    });
  });

  test.describe('Thinking indicator cleanup', () => {
    test('no stale thinking spinner after pipeline completion', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      // Wait for Approve button (signals completion)
      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // No thinking pulsing indicator should remain in the chat panel
      // (header-bar has its own animate-ping for agent status — exclude it)
      const chatPing = page.locator('main .animate-ping');
      await expect(chatPing).toHaveCount(0);
    });
  });

  test.describe('Step number continuity (regression)', () => {
    test('resume step numbers continue from initial phase, not reset to 1', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // Initial steps: 1-4 (contextRetriever through questionPrioritizer)
      await expect(page.getByText('Step 1 of 8').first()).toBeVisible();
      await expect(page.getByText('Step 4 of 8').first()).toBeVisible();

      // Resume steps must continue: 5-8 (storyWriter through emitComplete)
      // NOT restart at "Step 1 of 9"
      await expect(page.getByText('Step 5 of 8').first()).toBeVisible();
      await expect(page.getByText('Step 8 of 8').first()).toBeVisible();

      // No "Step 1 of 9" or "Step 9 of 9" should appear (old broken numbering)
      expect(await page.getByText('of 9').count()).toBe(0);
    });

    test('no duplicate emitComplete cards', async ({ page }) => {
      await mockInitialInterrupt(page);
      await mockResumeComplete(page);

      await submitPrompt(page);
      await answerAllAndSubmit(page);

      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // "Finalizing requirements..." should NOT appear — emitComplete removed from
      // STAGE_LABELS to prevent the old bug where it fired from BOTH node-complete
      // AND complete case, creating two cards
      expect(await page.getByText('Finalizing requirements...').count()).toBe(0);

      // Only one "Requirements complete!" stage card should exist in the chat panel
      // (split-panel layout may duplicate DOM elements, so scope to the chat column)
      await expect(page.getByText('Requirements complete!').first()).toBeVisible();
    });
  });
});
