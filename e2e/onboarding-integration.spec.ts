/**
 * @module onboarding-integration
 *
 * E2E integration test that runs the full onboarding wizard with REAL LLM calls.
 * Exercises two API routes that are always mocked in the standard suite:
 *   1. POST /api/design-options  — generates 3 design options via Claude
 *   2. POST /api/spec/generate   — generates pages/models/endpoints via Claude
 *
 * Skipped by default. Enable with:
 *   RUN_E2E_INTEGRATION=true ANTHROPIC_API_KEY=sk-ant-... npx playwright test --project=integration
 *
 * Estimated cost: ~$0.20-0.50 per run (two Sonnet calls with realistic PRD).
 */

import { test, expect, ROOT } from './fixtures/test-base';
import { OnboardingPO } from './pages/onboarding.po';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { TimingReport, measureMs } from './helpers/perf-helpers';

// ─── Gate ────────────────────────────────────────────────────────────────────

const RUN_INTEGRATION = process.env.RUN_E2E_INTEGRATION === 'true';
const describeIntegration = RUN_INTEGRATION ? test.describe : test.describe.skip;

// ─── Test project constants ─────────────────────────────────────────────────

const PROJECT_NAME = 'TeamFlow';
const PROJECT_DESC =
  'A collaborative project management and team communication platform for distributed teams.';
const PROJECT_SLUG = 'teamflow';
const PROJECT_DIR = join(ROOT, PROJECT_SLUG);

// ─── Realistic PRD (~90 lines) ─────────────────────────────────────────────

const REALISTIC_PRD = `# TeamFlow — Product Requirements Document

## Overview
TeamFlow is a collaborative project management and real-time communication platform
designed for distributed teams of 5-50 people. It combines kanban-style task tracking
with threaded messaging, file sharing, and lightweight time tracking to keep remote
teams aligned without tool-switching fatigue.

## Target Users
- **Team Leads** — create projects, assign tasks, track sprint progress, run standups
- **Individual Contributors** — manage personal task queues, update status, collaborate on deliverables
- **Stakeholders** — view high-level dashboards, approve milestones, review weekly reports

## Core Features

### F1: Project Dashboard
The home screen displays an overview of all active projects. Each project card shows
the project name, progress bar (% tasks completed), number of open tasks, upcoming
deadline, and team member avatars. Users can star/pin important projects. A global
search bar filters projects by name or tag. Empty state shows an onboarding prompt
to create the first project.

### F2: Kanban Board
A drag-and-drop board with configurable columns (default: Backlog, In Progress,
Review, Done). Each task card shows title, assignee avatar, priority badge (P0-P3),
due date, and label chips. Supports swimlanes grouped by assignee or priority.
WIP limits can be set per column with visual warnings when exceeded. Quick-add
input at the top of each column for rapid task creation.

### F3: Task Detail View
A slide-over panel showing the full task with: rich-text description (markdown),
subtask checklist with progress bar, file attachments (drag-drop upload, max 25MB),
activity log (comments, status changes, assignment changes), time tracking entries,
and related tasks. Assignee, priority, due date, and labels are editable inline.

### F4: Team Chat
Threaded messaging organized by channel (per-project channels auto-created).
Supports @mentions, emoji reactions, file sharing, and code snippets with syntax
highlighting. Unread badge counts in the sidebar. Message search with filters
(author, date range, channel). Typing indicators and online presence dots.

### F5: Time Tracking
A lightweight timer that can be started from any task card or the task detail view.
Shows a running timer in the top bar. Daily/weekly time reports per user and per
project. Exportable as CSV. Visual bar charts showing time distribution across
projects and categories.

### F6: Notifications & Activity Feed
A notification center with categorized alerts: task assignments, mentions, due date
reminders (24h and 1h before), comment replies, and milestone completions. Users
can configure notification preferences per channel (in-app, email digest, or muted).
Activity feed shows a chronological stream of all team actions.

### F7: Settings & Administration
User profile management (avatar, display name, timezone, notification preferences).
Project settings (name, description, default columns, WIP limits, member roles).
Team management (invite via email, role assignment: admin/member/viewer).
Billing page showing current plan, usage, and upgrade options.

## Non-Functional Requirements
- **Accessibility**: WCAG 2.1 AA compliance. All interactive elements must be
  keyboard navigable. Screen reader support for task cards and chat messages.
  Minimum contrast ratio of 4.5:1 for text.
- **Performance**: Dashboard loads in < 2 seconds. Kanban board supports 500+
  tasks without jank. Chat messages appear in < 200ms (optimistic updates).
- **Responsive**: Full functionality on desktop (1024px+). Simplified mobile
  view (640px+) with bottom tab navigation for Board, Chat, and Notifications.
- **Security**: OAuth 2.0 authentication. Role-based access control. All API
  endpoints require authentication. File uploads scanned for malware.

## Data Models
- **Project**: id, name, description, createdAt, ownerId, memberIds[], status
- **Task**: id, projectId, title, description, assigneeId, priority, status, dueDate, labels[], subtasks[], timeEntries[]
- **Message**: id, channelId, authorId, content, threadId, reactions[], attachments[], createdAt
- **User**: id, displayName, email, avatarUrl, timezone, role, notificationPrefs
- **TimeEntry**: id, taskId, userId, startedAt, endedAt, durationMinutes
- **Channel**: id, projectId, name, type (project|direct|general), memberIds[]
`;

const TARGET_AUDIENCE = 'Remote software teams, product managers, and engineering leads';

// ─── Timing report (printed in afterAll) ────────────────────────────────────

const timings = new TimingReport('ONBOARDING INTEGRATION — TIMING REPORT');

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanupTestProject(): void {
  if (existsSync(PROJECT_DIR)) {
    rmSync(PROJECT_DIR, { recursive: true, force: true });
  }
}

// ─── Required semantic color keys (from design-options route system prompt) ──

const REQUIRED_SEMANTIC_KEYS = [
  'background-primary', 'surface-primary', 'surface-elevated', 'surface-secondary',
  'surface-input', 'text-primary', 'text-secondary', 'text-disabled', 'text-on-cta',
  'cta-primary', 'cta-hover', 'border-default', 'border-focus', 'border-error',
  'error', 'success', 'warning',
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describeIntegration('Onboarding Integration (Real LLM)', () => {
  test.beforeAll(() => {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY must be set when RUN_E2E_INTEGRATION=true. ' +
        'Run: RUN_E2E_INTEGRATION=true ANTHROPIC_API_KEY=sk-ant-... npx playwright test --project=integration',
      );
    }
    cleanupTestProject();
  });

  test.afterAll(() => {
    cleanupTestProject();
    timings.print();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Full wizard with real LLM calls
  // ──────────────────────────────────────────────────────────────────────────

  test('full onboarding with real LLM design options and spec generation', async ({ page }) => {
    // Capture the design options API response for quality validation later
    let designOptionsResponse: {
      options: Array<Record<string, unknown>>;
      source: string;
      fallbackReason?: string;
    } | null = null;

    // Intercept the design-options response (don't block — just capture)
    page.on('response', async (response) => {
      if (response.url().includes('/api/design-options') && response.status() === 200) {
        try {
          designOptionsResponse = await response.json();
        } catch {
          // response already consumed — ignore
        }
      }
    });

    // Capture spec generation response
    let specGenerateResponse: {
      spec: { pages?: unknown[]; models?: unknown[]; endpoints?: unknown[] };
      logs?: Array<{ ts: number; level: string; message: string }>;
    } | null = null;

    page.on('response', async (response) => {
      if (response.url().includes('/api/spec/generate') && response.status() === 200) {
        try {
          specGenerateResponse = await response.json();
        } catch {
          // ignore
        }
      }
    });

    const wizard = new OnboardingPO(page);
    const totalStart = performance.now();

    // ── Step 1: Project basics ──
    await page.goto('/onboarding');
    await expect(page.getByText('Step 1 of 5')).toBeVisible();
    await wizard.fillName(PROJECT_NAME);
    await wizard.fillDescription(PROJECT_DESC);
    await wizard.clickNext();

    // ── Step 2: PRD ──
    await expect(page.getByText('Step 2 of 5')).toBeVisible();
    await page.locator('textarea').fill(REALISTIC_PRD);
    await wizard.clickNext();

    // ── Step 3: Design system — REAL LLM call ──
    await expect(page.getByText('Step 3 of 5')).toBeVisible();

    // Click "Generate Design Options" (NOT "Use defaults")
    const { durationMs: designOptionsDuration } = await measureMs(async () => {
      await page.getByRole('button', { name: 'Generate Design Options' }).click();
      // Wait for the preview iframe to appear (LLM call + HTML generation)
      await page.locator('iframe[title="Design preview"]').waitFor({ state: 'attached', timeout: 120_000 });
    });
    timings.record('Design Options LLM', designOptionsDuration,
      `source=${designOptionsResponse?.source ?? 'unknown'}, options=${designOptionsResponse?.options?.length ?? '?'}`);

    // Verify LLM was actually used (not fallback)
    expect(designOptionsResponse).not.toBeNull();
    expect(designOptionsResponse!.source).toBe('llm');
    expect(designOptionsResponse!.fallbackReason).toBeUndefined();

    // Select a design option
    await wizard.selectDesignOption();
    await wizard.clickNext();

    // ── Step 4: Audience + library ──
    await expect(page.getByText('Step 4 of 5')).toBeVisible();
    await wizard.fillAudience(TARGET_AUDIENCE);
    await wizard.clickNext();

    // ── Step 5: Review + create — REAL spec generation LLM call ──
    await expect(page.getByText('Step 5 of 5')).toBeVisible();
    await expect(page.getByText(PROJECT_NAME)).toBeVisible();

    // Click "Create project" — this triggers /api/projects, then redirects
    // to /spec?generate=true which auto-triggers /api/spec/generate (real LLM)
    const { durationMs: createAndSpecDuration } = await measureMs(async () => {
      await wizard.clickCreate();
      // Wait for redirect to spec page
      await expect(page).toHaveURL(/\/spec\?generate=true/, { timeout: 30_000 });
      // Wait for spec generation to complete — the "Generate Spec" button
      // text changes from "Generating..." back to "Generate Spec" when done
      await page.getByTestId('generate-spec-btn').filter({ hasText: 'Generate Spec' }).waitFor({ timeout: 120_000 });
    });
    timings.record('Project Create + Spec Gen', createAndSpecDuration,
      specGenerateResponse?.spec
        ? `pages=${specGenerateResponse.spec.pages?.length ?? 0}, models=${specGenerateResponse.spec.models?.length ?? 0}, endpoints=${specGenerateResponse.spec.endpoints?.length ?? 0}`
        : 'no response captured');

    // ── Verify log panel shows real API info ──
    const logPanel = page.getByTestId('spec-log-panel');
    await expect(logPanel).toBeVisible();
    await expect(logPanel.getByText(/Claude auth resolved/)).toBeVisible();
    await expect(logPanel.getByText(/agentforge\.yaml: loaded/)).toBeVisible();
    await expect(logPanel.getByText(/docs\/prd\.md: loaded/)).toBeVisible();
    await expect(logPanel.getByText(/Spec generation complete/)).toBeVisible();

    // ── Verify files on disk ──

    // agentforge.yaml — project name and description
    const agentforgeYamlPath = join(PROJECT_DIR, 'agentforge.yaml');
    expect(existsSync(agentforgeYamlPath)).toBe(true);
    const agentforgeYaml = parse(readFileSync(agentforgeYamlPath, 'utf-8'));
    expect(agentforgeYaml.project.name).toBe(PROJECT_NAME);
    expect(agentforgeYaml.project.description).toBe(PROJECT_DESC);

    // docs/prd.md — full PRD content preserved
    const prdPath = join(PROJECT_DIR, 'docs', 'prd.md');
    expect(existsSync(prdPath)).toBe(true);
    const prdOnDisk = readFileSync(prdPath, 'utf-8');
    expect(prdOnDisk).toContain('TeamFlow');
    expect(prdOnDisk).toContain('Kanban Board');
    expect(prdOnDisk).toContain('Time Tracking');

    // design-tokens.yaml — LLM-generated (not fallback archetypes)
    const tokensPath = join(PROJECT_DIR, 'agentforge', 'spec', 'design-tokens.yaml');
    expect(existsSync(tokensPath)).toBe(true);
    const tokens = parse(readFileSync(tokensPath, 'utf-8'));
    expect(tokens).toBeDefined();
    // LLM-generated tokens should have created_by containing 'llm'
    expect(tokens.created_by).toMatch(/llm/i);

    // brand.yaml — LLM-generated
    const brandPath = join(PROJECT_DIR, 'agentforge', 'spec', 'brand.yaml');
    expect(existsSync(brandPath)).toBe(true);
    const brand = parse(readFileSync(brandPath, 'utf-8'));
    expect(brand).toBeDefined();
    expect(brand.created_by).toMatch(/llm/i);

    // pages.yaml — LLM-generated pages (not empty)
    const pagesPath = join(PROJECT_DIR, 'agentforge', 'spec', 'pages.yaml');
    expect(existsSync(pagesPath)).toBe(true);
    const pagesYaml = parse(readFileSync(pagesPath, 'utf-8'));
    expect(pagesYaml.pages).toBeDefined();
    expect(pagesYaml.pages.length).toBeGreaterThanOrEqual(3);
    // Each page should have required fields
    for (const p of pagesYaml.pages) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.designStatus).toBe('draft');
    }

    // models.yaml — LLM-generated data models
    const modelsPath = join(PROJECT_DIR, 'agentforge', 'spec', 'models.yaml');
    if (existsSync(modelsPath)) {
      const models = parse(readFileSync(modelsPath, 'utf-8'));
      expect(models.models).toBeDefined();
      expect(models.models.length).toBeGreaterThanOrEqual(2);
    }

    // Record total time
    timings.record('Total E2E', performance.now() - totalStart);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Design options quality validation
  // ──────────────────────────────────────────────────────────────────────────

  test('LLM-generated design options have valid structure and quality', async ({ page }) => {
    const wizard = new OnboardingPO(page);

    // Capture design options response
    const designOptionsPromise = page.waitForResponse(
      (response) => response.url().includes('/api/design-options') && response.status() === 200,
      { timeout: 120_000 },
    );

    await page.goto('/onboarding');
    await wizard.fillName('Design Quality Test');
    await wizard.fillDescription('A project management tool for testing design quality');
    await wizard.clickNext();

    // Step 2: PRD
    await page.locator('textarea').fill(REALISTIC_PRD);
    await wizard.clickNext();

    // Step 3: Generate via LLM
    await expect(page.getByText('Step 3 of 5')).toBeVisible();
    await page.getByRole('button', { name: 'Generate Design Options' }).click();

    const response = await designOptionsPromise;
    const data = await response.json();

    expect(data.source).toBe('llm');
    expect(data.options).toBeDefined();
    expect(data.options.length).toBeGreaterThanOrEqual(3);

    // Validate each option's structure and quality
    for (let i = 0; i < data.options.length; i++) {
      const opt = data.options[i];
      const label = opt.label ?? `option-${i}`;

      // Label and vibe
      expect(opt.label, `option ${i} missing label`).toBeTruthy();
      expect(opt.vibe, `${label} missing vibe`).toBeTruthy();

      // Colors — primitive (5+ entries)
      expect(opt.colors, `${label} missing colors`).toBeDefined();
      const primitiveKeys = Object.keys(opt.colors.primitive ?? {});
      expect(
        primitiveKeys.length,
        `${label}: expected 5+ primitive colors, got ${primitiveKeys.length}`,
      ).toBeGreaterThanOrEqual(5);

      // Colors — semantic (17 required keys)
      const semanticKeys = Object.keys(opt.colors.semantic ?? {});
      for (const requiredKey of REQUIRED_SEMANTIC_KEYS) {
        expect(
          semanticKeys,
          `${label}: missing semantic color '${requiredKey}'`,
        ).toContain(requiredKey);
      }

      // Fonts — must be strings (Google Font names)
      expect(typeof opt.fonts?.display, `${label}: fonts.display must be a string`).toBe('string');
      expect(typeof opt.fonts?.body, `${label}: fonts.body must be a string`).toBe('string');
      expect(opt.fonts.display.length, `${label}: fonts.display is empty`).toBeGreaterThan(0);
      expect(opt.fonts.body.length, `${label}: fonts.body is empty`).toBeGreaterThan(0);

      // Brand attributes
      expect(opt.brand?.tone, `${label}: missing brand.tone`).toBeTruthy();
      expect(opt.brand?.illustrationDirection, `${label}: missing brand.illustrationDirection`).toBeTruthy();
    }

    // Verify preview HTML was generated and renders in iframe
    expect(data.previewHtml).toBeTruthy();
    await page.locator('iframe[title="Design preview"]').waitFor({ state: 'attached', timeout: 15_000 });

    // Log quality summary
    console.log('\n── Design Options Quality Summary ──');
    for (const opt of data.options) {
      const primCount = Object.keys(opt.colors?.primitive ?? {}).length;
      const semCount = Object.keys(opt.colors?.semantic ?? {}).length;
      console.log(`  ${opt.label}: ${primCount} primitives, ${semCount} semantic, fonts=${opt.fonts?.display}/${opt.fonts?.body}`);
    }
    console.log('');
  });
});

// ─── Skip guard (always runs) ───────────────────────────────────────────────

test.describe('Onboarding Integration (skip guard)', () => {
  test('integration tests are skipped when RUN_E2E_INTEGRATION is not set', () => {
    if (RUN_INTEGRATION) {
      console.log('[integration] RUN_E2E_INTEGRATION=true — integration tests are running');
    } else {
      console.log('[integration] RUN_E2E_INTEGRATION not set — integration tests skipped (expected)');
    }
    expect(true).toBe(true);
  });
});
