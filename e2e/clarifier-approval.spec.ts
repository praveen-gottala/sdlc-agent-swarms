/**
 * E2E tests for the Clarifier approval flow — Approve & Continue button.
 * Scope: complete clarifier → click Approve → project creation → navigation.
 * Uses mocked SSE responses and mocked /api/projects endpoint.
 */

import { test, expect, PET_ROOT } from './fixtures/test-base';

function buildSSE(events: Array<{ event: string; data: Record<string, unknown> }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');
}

const PRD_DRAFT = {
  id: 'prd-1',
  title: 'CashPulse',
  description: 'Personal finance tracker',
  features: [
    { id: 'f1', name: 'Expense Tracking', description: 'Track daily expenses', priority: 'must-have' },
  ],
  personas: [{ id: 'p1', name: 'User', role: 'End user', goals: ['Track spending'] }],
  dataEntities: [{ id: 'e1', name: 'Expense', fields: [{ name: 'amount', type: 'number', required: true }] }],
  screens: [{ id: 's1', name: 'Dashboard', description: 'Main view', screenType: 'page' }],
  nfrs: [],
  successMetrics: [],
  outOfScope: [],
  version: '1.0',
  status: 'approved',
};

const ENRICHED_REQUIREMENT = {
  id: 'er-1',
  rawInput: 'Build a personal finance tracker',
  mode: 'bootstrap',
  prd: PRD_DRAFT,
  assumptionLedger: {
    id: 'al-1',
    entries: [{ id: 'a1', statement: 'Users have bank accounts', evidence: 'Common', confidence: 0.9, blastRadius: 'low', requiresConfirmation: false }],
    createdAt: '2026-05-12T00:00:00Z',
    lastUpdatedAt: '2026-05-12T00:00:00Z',
  },
  clarificationRounds: [{ round: 1, questionsAsked: 1, questionsAnswered: 1, timestamp: '2026-05-12T00:00:00Z' }],
  confidence: 0.92,
  createdAt: '2026-05-12T00:00:00Z',
};

const COMPLETE_STATE = {
  mode: 'bootstrap',
  round: 1,
  maxRounds: 3,
  questions: [],
  gaps: [],
  humanResponses: [],
  requirement: ENRICHED_REQUIREMENT,
  assumptions: ENRICHED_REQUIREMENT.assumptionLedger,
  prdDraft: PRD_DRAFT,
  featurePlan: null,
  error: null,
};

async function mockClarifierComplete(page: import('@playwright/test').Page) {
  await page.route('**/api/clarifier', async (route) => {
    const sse = buildSSE([
      { event: 'stage', data: { stage: 'contextRetriever', label: 'Loading...', index: 0, total: 8 } },
      { event: 'stage', data: { stage: 'prdAnalyzer', label: 'Analyzing...', index: 1, total: 8 } },
      { event: 'prd-draft', data: { prdDraft: PRD_DRAFT } },
      { event: 'stage', data: { stage: 'emitComplete', label: 'Done!', index: 7, total: 8 } },
      {
        event: 'result',
        data: { threadId: 'approval-thread', interrupted: false, state: COMPLETE_STATE },
      },
    ]);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: sse,
    });
  });
}

test.describe('Clarifier Approval Flow', () => {
  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(PET_ROOT);
    await page.goto('/new');
    await page.waitForLoadState('networkidle');
  });

  test('clicking Approve creates project and navigates on success', async ({ page }) => {
    await mockClarifierComplete(page);

    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ projectId: 'cashpulse', path: '/tmp/apps/cashpulse' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.locator('textarea').first().fill('Build a personal finance tracker');
    await page.keyboard.press('Enter');

    const approveBtn = page.getByRole('button', { name: /Approve/ }).first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();

    await page.waitForURL('**/design**', { timeout: 10000 });

    expect(capturedBody).toBeDefined();
    expect(capturedBody!.name).toBe('CashPulse');
    expect(capturedBody!.clarifierOutput).toBeDefined();
    const output = capturedBody!.clarifierOutput as { enrichedRequirement: Record<string, unknown>; threadId: string };
    expect(output.threadId).toBe('approval-thread');
    expect(output.enrichedRequirement).toHaveProperty('prd');
    expect(output.enrichedRequirement).toHaveProperty('confidence', 0.92);
  });

  test('shows error notification when project creation fails', async ({ page }) => {
    await mockClarifierComplete(page);

    await page.route('**/api/projects', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Disk full — cannot create project' }),
        });
      } else {
        await route.continue();
      }
    });

    await page.locator('textarea').first().fill('Build a personal finance tracker');
    await page.keyboard.press('Enter');

    const approveBtn = page.getByRole('button', { name: /Approve/ }).first();
    await expect(approveBtn).toBeVisible({ timeout: 15000 });
    await approveBtn.click();

    await expect(page.getByText('Disk full').first()).toBeVisible({ timeout: 10000 });
  });
});
