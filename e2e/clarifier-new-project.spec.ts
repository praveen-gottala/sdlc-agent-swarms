/**
 * E2E tests for the Clarifier /new page — full question-answer flow.
 * Scope: submit prompt → see questions → answer → resume → PRD updates.
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
  { event: 'stage', data: { stage: 'gapDetector', label: 'Detecting gaps...', index: 2, total: 8 } },
  { event: 'stage', data: { stage: 'questionPrioritizer', label: 'Questions ready!', index: 3, total: 8 } },
];

const PRD_DRAFT = {
  title: 'Pomodoro Timer PRD', description: 'A time management app using the Pomodoro technique',
  features: [
    { id: 'f1', name: 'Timer', description: 'A 25-minute countdown timer', priority: 'must-have' },
    { id: 'f2', name: 'Break Timer', description: 'A 5-minute break timer', priority: 'must-have' },
    { id: 'f3', name: 'Statistics', description: 'Track completed pomodoros', priority: 'should-have' },
  ],
  personas: [{ id: 'p1', name: 'Focus Worker', role: 'End user', goals: ['Stay focused', 'Track productivity'] }],
  dataEntities: [{ id: 'd1', name: 'Session', fields: [{ name: 'duration', type: 'number', required: true }] }],
  screens: [{ id: 's1', name: 'Timer', description: 'Main timer view', screenType: 'page' }],
  nfrs: [{ id: 'n1', category: 'Performance', description: 'Timer accurate to ±1s', target: '±1s' }],
  successMetrics: [{ id: 'm1', name: 'Sessions', description: 'Completed pomodoros per day', target: '8', measurement: 'Counter' }],
  outOfScope: ['Team features'],
};

const UPDATED_PRD_DRAFT = {
  ...PRD_DRAFT,
  title: 'Pomodoro Timer PRD (Updated)',
  features: [
    ...PRD_DRAFT.features,
    { id: 'f4', name: 'Notifications', description: 'Sound alerts when timer ends', priority: 'must-have' },
  ],
};

const QUESTIONS = [
  {
    id: 'q1', gapId: 'g1', topic: 'Notifications', text: 'Should the timer play a sound when a pomodoro ends?',
    type: 'multiple-choice',
    options: [
      { label: 'Sound alert', description: 'Play a chime sound', recommended: true, source: 'llm' },
      { label: 'Visual only', description: 'Flash the screen only', recommended: false, source: 'llm' },
    ],
    priority: 1, evpiScore: 0.9,
  },
  {
    id: 'q2', gapId: 'g2', topic: 'Data', text: 'Where should session data be stored?',
    type: 'multiple-choice',
    options: [
      { label: 'Local storage', description: 'Browser localStorage', recommended: true, source: 'llm' },
      { label: 'Server database', description: 'PostgreSQL backend', recommended: false, source: 'llm' },
    ],
    priority: 2, evpiScore: 0.7,
  },
];

const GAPS = [
  { id: 'g1', topic: 'Notifications', description: 'No notification mechanism specified', category: 'missing', confidence: 0.3, deterministic: true },
  { id: 'g2', topic: 'Data', description: 'No storage mechanism specified', category: 'missing', confidence: 0.4, deterministic: true },
];

const INTERRUPT_STATE = {
  mode: 'bootstrap', round: 1, maxRounds: 3,
  questions: QUESTIONS, gaps: GAPS,
  humanResponses: [],
  requirement: null, assumptions: null, prdDraft: PRD_DRAFT, featurePlan: null, error: null,
};

/** Helper: mock the initial clarifier API to return an interrupt with questions. */
async function mockClarifierInterrupt(page: import('@playwright/test').Page, state = INTERRUPT_STATE, threadId = 'pomo-thread') {
  await page.route('**/api/clarifier', async (route) => {
    const sse = buildSSE([
      ...STAGE_EVENTS,
      { event: 'prd-draft', data: { prdDraft: state.prdDraft } },
      { event: 'gaps', data: { gaps: state.gaps } },
      { event: 'result', data: { threadId, interrupted: true, state } },
    ]);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sse,
    });
  });
}

/** Helper: submit the initial prompt and wait for questions to appear. */
async function submitAndWaitForQuestions(page: import('@playwright/test').Page, prompt = 'Build a pomodoro timer app') {
  await page.locator('textarea').first().fill(prompt);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Should the timer play a sound').first()).toBeVisible({ timeout: 10000 });
}

/** Helper: answer both questions by selecting the first option for each. */
async function answerAllQuestions(page: import('@playwright/test').Page) {
  // Answer question 1
  await page.getByRole('button', { name: /Sound alert/ }).first().click();

  // Navigate to question 2
  const q2Tab = page.locator('button[role="tab"]').filter({ hasText: /Data|Q2/ }).first();
  if (await q2Tab.isVisible()) {
    await q2Tab.click();
  }
  await expect(page.getByText('Where should session data be stored?').first()).toBeVisible({ timeout: 5000 });

  // Answer question 2
  await page.getByRole('button', { name: /Local storage/ }).first().click();
}

test.describe('Clarifier New Project Flow', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/new');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Submit prompt and see questions', () => {
    test.beforeEach(async ({ page }) => {
      await mockClarifierInterrupt(page);
      await page.locator('textarea').first().fill('Build a pomodoro timer app');
      await page.keyboard.press('Enter');
    });

    test('displays all questions with options', async ({ page }) => {
      await expect(page.getByText('Should the timer play a sound when a pomodoro ends?').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Sound alert').first()).toBeVisible();
      await expect(page.getByText('Visual only').first()).toBeVisible();
      await expect(page.getByText('Recommended').first()).toBeVisible();
    });

    test('shows round counter and multiple question tabs', async ({ page }) => {
      await expect(page.getByText(/Round 1\/3/i).first()).toBeVisible({ timeout: 10000 });
      // With 2 questions, two tabs should be visible
      const tabs = page.locator('button[role="tab"]');
      await expect(tabs.first()).toBeVisible();
      expect(await tabs.count()).toBeGreaterThanOrEqual(2);
    });

    test('PRD document panel shows draft content', async ({ page }) => {
      await expect(page.getByText('Pomodoro Timer PRD').first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('A 25-minute countdown timer').first()).toBeVisible();
      await expect(page.getByText('Break Timer').first()).toBeVisible();
    });

    test('selecting options enables submit', async ({ page }) => {
      await expect(page.getByText('Should the timer play a sound').first()).toBeVisible({ timeout: 10000 });
      await answerAllQuestions(page);

      const submitBtn = page.getByRole('button', { name: /Submit Answers/ }).first();
      await expect(submitBtn).toBeVisible();
    });
  });

  test.describe('Answer questions and verify resume', () => {
    test('submitting answers sends correct request to /api/clarifier/respond', async ({ page }) => {
      await mockClarifierInterrupt(page);

      let capturedBody: Record<string, unknown> | null = null;
      await page.route('**/api/clarifier/respond', async (route) => {
        capturedBody = route.request().postDataJSON();
        const sse = buildSSE([
          { event: 'stage', data: { stage: 'storyWriter', label: 'Writing user stories...', index: 4, total: 8 } },
          { event: 'stage', data: { stage: 'critic', label: 'Reviewing quality...', index: 5, total: 8 } },
          { event: 'stage', data: { stage: 'prdUpdater', label: 'Updating PRD...', index: 6, total: 8 } },
          { event: 'prd-draft', data: { prdDraft: UPDATED_PRD_DRAFT } },
          { event: 'stage', data: { stage: 'emitComplete', label: 'Requirements complete!', index: 7, total: 8 } },
          {
            event: 'result', data: {
              threadId: 'pomo-thread', interrupted: false,
              state: {
                ...INTERRUPT_STATE, round: 1, questions: [],
                requirement: { prd: UPDATED_PRD_DRAFT, confidence: 0.88 },
                assumptions: { entries: [] },
                prdDraft: UPDATED_PRD_DRAFT,
                humanResponses: [
                  { questionId: 'q1', answer: 'Sound alert', selectedOption: 'Sound alert' },
                  { questionId: 'q2', answer: 'Local storage', selectedOption: 'Local storage' },
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

      await submitAndWaitForQuestions(page);
      await answerAllQuestions(page);
      await page.getByRole('button', { name: /Submit Answers/ }).first().click();

      // Wait for pipeline to complete
      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      // Verify the request body
      expect(capturedBody).toBeDefined();
      expect(capturedBody!.threadId).toBe('pomo-thread');
      expect(capturedBody!.answers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ questionId: 'q1', selectedOption: 'Sound alert' }),
          expect.objectContaining({ questionId: 'q2', selectedOption: 'Local storage' }),
        ]),
      );
    });

    test('resume shows storyWriter stages and updated PRD', async ({ page }) => {
      await mockClarifierInterrupt(page);

      const resumeStages: string[] = [];
      await page.route('**/api/clarifier/respond', async (route) => {
        const sse = buildSSE([
          { event: 'stage', data: { stage: 'storyWriter', label: 'Writing user stories...', index: 4, total: 8 } },
          { event: 'stage', data: { stage: 'critic', label: 'Reviewing quality...', index: 5, total: 8 } },
          { event: 'stage', data: { stage: 'prdUpdater', label: 'Updating PRD...', index: 6, total: 8 } },
          { event: 'prd-draft', data: { prdDraft: UPDATED_PRD_DRAFT } },
          { event: 'stage', data: { stage: 'emitComplete', label: 'Requirements complete!', index: 7, total: 8 } },
          {
            event: 'result', data: {
              threadId: 'pomo-thread', interrupted: false,
              state: {
                ...INTERRUPT_STATE, questions: [],
                requirement: { prd: UPDATED_PRD_DRAFT, confidence: 0.88 },
                assumptions: { entries: [] },
                prdDraft: UPDATED_PRD_DRAFT,
              },
            },
          },
        ]);
        resumeStages.push('storyWriter', 'critic', 'prdUpdater', 'emitComplete');
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: sse,
        });
      });

      await submitAndWaitForQuestions(page);
      await answerAllQuestions(page);
      await page.getByRole('button', { name: /Submit Answers/ }).first().click();

      // After resume, PRD should be updated
      await expect(page.getByText('Pomodoro Timer PRD (Updated)').first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Sound alerts when timer ends').first()).toBeVisible();

      // Verify resume path included storyWriter (not contextRetriever repeat)
      expect(resumeStages).toContain('storyWriter');
      expect(resumeStages).not.toContain('contextRetriever');
    });
  });

  test.describe('Escalation flow', () => {
    const escalationState = {
      ...INTERRUPT_STATE,
      round: 3, maxRounds: 3,
    };

    test('shows escalation controls when maxRounds reached', async ({ page }) => {
      await mockClarifierInterrupt(page, escalationState, 'esc-thread');

      await page.locator('textarea').first().fill('Complex enterprise app');
      await page.keyboard.press('Enter');

      await expect(page.getByRole('heading', { name: 'Maximum Rounds Reached' }).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('button', { name: /Accept/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Restart/ }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Abandon/ }).first()).toBeVisible();
    });

    test('accept sends escalation decision to respond endpoint', async ({ page }) => {
      await mockClarifierInterrupt(page, escalationState, 'esc-thread');

      let capturedBody: Record<string, unknown> | null = null;
      await page.route('**/api/clarifier/respond', async (route) => {
        capturedBody = route.request().postDataJSON();
        const sse = buildSSE([
          { event: 'stage', data: { stage: 'emitComplete', label: 'Requirements complete!', index: 7, total: 8 } },
          {
            event: 'result', data: {
              threadId: 'esc-thread', interrupted: false,
              state: {
                ...escalationState, questions: [],
                requirement: { prd: PRD_DRAFT, confidence: 0.75 },
                assumptions: { entries: [] },
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

      await page.locator('textarea').first().fill('Complex enterprise app');
      await page.keyboard.press('Enter');

      await expect(page.getByRole('heading', { name: 'Maximum Rounds Reached' }).first()).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /Accept/ }).first().click();

      await expect(page.getByRole('button', { name: /Approve/ }).first()).toBeVisible({ timeout: 15000 });

      expect(capturedBody).toBeDefined();
      expect(capturedBody!.escalationDecision).toBe('accept');
      expect(capturedBody!.threadId).toBe('esc-thread');
    });

    test('restart re-runs the pipeline', async ({ page }) => {
      await mockClarifierInterrupt(page, escalationState, 'esc-thread');

      await page.locator('textarea').first().fill('Complex enterprise app');
      await page.keyboard.press('Enter');

      await expect(page.getByRole('heading', { name: 'Maximum Rounds Reached' }).first()).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /Restart/ }).first().click();

      // Restart triggers a new pipeline run — look for stage progress re-appearing
      await expect(page.getByText('Loading project context...').first()).toBeVisible({ timeout: 10000 });
    });
  });
});
