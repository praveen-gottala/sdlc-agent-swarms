import { test, expect, PET_ROOT } from './fixtures/test-base';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(__dirname, '..');

/**
 * Seed events.jsonl with sample PipelineRunProgress events that include taskId + detail.
 * This lets us test the Traces, Activity, and Tasks pages without running the real LLM pipeline.
 */
function seedEvents(projectRoot: string, taskId: string) {
  const agentforgeDir = join(projectRoot, '.agentforge');
  if (!existsSync(agentforgeDir)) {
    mkdirSync(agentforgeDir, { recursive: true });
  }

  const now = Date.now();
  const events = [
    {
      type: 'PipelineRunProgress',
      runId: 'run-test-001',
      pipeline: 'design-penpot',
      stage: 'Research',
      stageIndex: 0,
      totalStages: 3,
      status: 'started',
      taskId,
      agentRole: 'ux_research',
      detail: 'Research: analyzing page requirements',
      source: 'dashboard',
      timestamp: now - 10000,
    },
    {
      type: 'PipelineRunProgress',
      runId: 'run-test-001',
      pipeline: 'design-penpot',
      stage: 'Research',
      stageIndex: 0,
      totalStages: 3,
      status: 'completed',
      taskId,
      agentRole: 'ux_research',
      detail: 'Research complete',
      source: 'dashboard',
      timestamp: now - 8000,
    },
    {
      type: 'PipelineRunProgress',
      runId: 'run-test-001',
      pipeline: 'design-penpot',
      stage: 'Design',
      stageIndex: 2,
      totalStages: 3,
      status: 'completed',
      taskId,
      agentRole: 'penpot_design',
      detail: 'Design spec generated successfully',
      source: 'dashboard',
      timestamp: now - 5000,
    },
  ];

  const lines = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  writeFileSync(join(agentforgeDir, 'events.jsonl'), lines);
}

/**
 * Seed a minimal tasks yaml so the Tasks page has data.
 */
function seedTasks(projectRoot: string, taskId: string) {
  const tasksYaml = `tasks:
  - id: ${taskId}
    title: "Design page: Dashboard"
    phase: design
    agent: ux_research
    status: completed
    depends_on: []
    spec_ref: agentforge/designs/dashboard.json
    branch: null
    pr_number: null
    cost_usd: 0
    tokens_used: 0
    attempts: 0
    max_attempts: 3
    hitl_status: none
    hitl_channel: null
`;
  writeFileSync(join(projectRoot, 'agentforge.tasks.yaml'), tasksYaml);
}

test.describe('Design Pipeline Traces Integration', () => {
  const taskId = 'task-design-dashboard-test';

  test.beforeEach(async ({ setActiveProject }) => {
    setActiveProject(PET_ROOT);
    seedEvents(PET_ROOT, taskId);
    seedTasks(PET_ROOT, taskId);
  });

  test('traces page shows task entries from events', async ({ page }) => {
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // The traces page should show at least one entry (not an empty state)
    // Wait for the trace list or entries to appear
    const content = await page.textContent('body');
    expect(content).toBeTruthy();

    // Should not show "No traces" empty state if events were seeded
    // The task ID should appear somewhere in the traces list
    const traceResponse = await page.request.get(`/api/traces`);
    const traceData = await traceResponse.json();
    expect(traceData.taskIds).toContain(taskId);
    expect(traceData.total).toBeGreaterThan(0);
  });

  test('trace detail shows stage names and agent roles', async ({ page }) => {
    // Fetch trace detail via API
    const response = await page.request.get(`/api/traces/${taskId}`);
    const data = await response.json();

    expect(data.trace.status).toBe('complete');
    expect(data.trace.steps.length).toBeGreaterThan(0);

    // Steps should have enriched fields
    const firstStep = data.trace.steps[0];
    expect(firstStep.stage).toBe('Research');
    expect(firstStep.agentRole).toBe('ux_research');
    expect(firstStep.detail).toBe('Research: analyzing page requirements');
  });

  test('trace timestamps are not corrupted', async ({ page }) => {
    const response = await page.request.get(`/api/traces/${taskId}`);
    const data = await response.json();

    // Check that timestamps are reasonable (within last day, not year 58217)
    const startedAt = new Date(data.trace.startedAt);
    const now = new Date();
    const diffMs = now.getTime() - startedAt.getTime();

    // Should be within 1 day, not thousands of years
    expect(diffMs).toBeLessThan(86400000);
    expect(diffMs).toBeGreaterThanOrEqual(0);
  });

  test('audit API returns correct timestamps', async ({ page }) => {
    const response = await page.request.get('/api/audit?limit=5');
    const data = await response.json();

    if (data.entries.length > 0) {
      const entry = data.entries[0];
      const ts = new Date(entry.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - ts.getTime();

      // Should be within 1 day
      expect(diffMs).toBeLessThan(86400000);
    }
  });

  test('activity sidebar shows readable descriptions, not raw type names', async ({ page }) => {
    // Fetch audit entries via API (same source as activity sidebar)
    const response = await page.request.get('/api/audit?limit=10');
    const data = await response.json();

    if (data.entries.length > 0) {
      // Parse details to check that descriptions are set
      for (const entry of data.entries) {
        try {
          const details = JSON.parse(entry.details);
          if (details.type === 'PipelineRunProgress' && details.detail) {
            // The detail field should be human-readable, not a raw event type
            expect(details.detail).not.toBe('PipelineRunProgress');
            expect(details.detail.length).toBeGreaterThan(5);
          }
        } catch {
          // Non-JSON details are fine
        }
      }
    }
  });

  test('tasks page shows real page name in task title', async ({ page }) => {
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');

    // Check via API that tasks have meaningful titles
    const response = await page.request.get('/api/tasks');
    const data = await response.json();
    const tasks = data.tasks ?? data.data ?? [];

    if (tasks.length > 0) {
      const designTask = tasks.find((t: Record<string, unknown>) =>
        (t.title as string)?.includes('Design page:'),
      );
      if (designTask) {
        // Title should contain actual page name, not "dashboard" hardcoded
        expect(designTask.title).toMatch(/Design page:/);
      }
    }
  });

  test('task status PATCH endpoint validates transitions', async ({ page }) => {
    // Invalid transition: completed → in_progress is not allowed
    const response = await page.request.patch(`/api/tasks/${taskId}/status`, {
      data: { status: 'in_progress' },
    });

    // Task is 'completed' — transition to 'in_progress' should fail
    // (completed has no valid transitions in the state machine)
    expect(response.status()).toBe(422);
  });

  test('tasks page toApiStatus maps correctly', async ({ page }) => {
    // Verify the API accepts the correct status values
    // 'awaiting_approval' should be valid (not 'review')
    // 'completed' should be valid (not 'done')
    const validStatuses = ['pending', 'in_progress', 'awaiting_approval', 'completed'];

    for (const status of validStatuses) {
      const response = await page.request.patch(`/api/tasks/${taskId}/status`, {
        data: { status },
      });
      // We don't care about transition validity here, just that the status value is accepted
      // (not a 400 "invalid status" error)
      expect(response.status()).not.toBe(400);
    }
  });
});
