import { test, expect, CLAIM_ROOT } from './fixtures/test-base';
import { DesignStudioPO } from './pages/design-studio.po';

test.describe('Design Chat Iteration', () => {
  let studio: DesignStudioPO;

  test.beforeEach(async ({ page, setActiveProject }) => {
    setActiveProject(CLAIM_ROOT);
    studio = new DesignStudioPO(page);
    await page.goto('/design', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid^="page-"]').first().waitFor({
      state: 'attached',
      timeout: 15000,
    });
  });

  test('can type and submit a chat message on Dashboard page', async ({ page }) => {
    await studio.selectPage('page-001');
    await studio.clickChatTab();

    const textarea = page.getByTestId('chat-textarea');
    await expect(textarea).toBeVisible();

    const chatMessage = 'Break down Claims by Status into individual claim types';
    await studio.fillChatMessage(chatMessage);
    await expect(textarea).toHaveValue(chatMessage);

    // Mock the API so we don't trigger a real pipeline
    await page.route('**/api/pages/page-001/design/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ runId: 'mock-run-1', pageId: 'page-001', taskId: 'task-1', status: 'running' }),
      }),
    );
    // Mock run polling to return complete immediately
    await page.route('**/api/runs/mock-run-1', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runId: 'mock-run-1',
          type: 'design-chat-iterate',
          status: 'complete',
          stage: 'Design',
          stageDescription: 'Complete',
          progress: { current: 2, total: 3, label: 'Design' },
          agentRole: 'penpot_design',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          error: null,
          params: {},
          cost: { totalCostUsd: 0.05, tokensUsed: 5000 },
          stageTimings: null,
        }),
      }),
    );

    await studio.clickChatSend();

    // Textarea should be cleared
    await expect(textarea).toHaveValue('');

    // Chat message should appear in history
    const chatHistory = page.locator('[class*="bg-accent-blue"]').filter({ hasText: chatMessage });
    await expect(chatHistory).toBeVisible();
  });

  test('chat iteration triggers pipeline progress UI', async ({ page }) => {
    await studio.selectPage('page-001');
    await studio.clickChatTab();

    // Mock chat API
    await page.route('**/api/pages/page-001/design/chat', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ runId: 'mock-run-2', pageId: 'page-001', taskId: 'task-2', status: 'running' }),
      }),
    );

    // Mock run status — return complete on first poll
    await page.route('**/api/runs/mock-run-2', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runId: 'mock-run-2',
          type: 'design-chat-iterate',
          status: 'complete',
          stage: 'Design',
          stageDescription: 'All stages completed',
          progress: { current: 2, total: 3, label: 'Design' },
          agentRole: 'penpot_design',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          error: null,
          params: {},
          cost: { totalCostUsd: 0.08, tokensUsed: 8000 },
          stageTimings: null,
        }),
      }),
    );

    await studio.fillChatMessage('Add a sidebar with navigation links');
    await studio.clickChatSend();

    // Pipeline progress should appear (it shows "Pipeline Complete" for complete status)
    const pipelineComplete = page.getByText('Pipeline Complete');
    await expect(pipelineComplete).toBeVisible({ timeout: 10000 });
  });
});
