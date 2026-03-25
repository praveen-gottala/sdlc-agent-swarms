import {
  prReviewerWork,
  PR_REVIEWER_CONTRACT,
  parseReviewOutput,
  extractFeedbackThemes,
  createObservationsFromFeedback,
  handleContradictions,
  promoteRecurringPatterns,
} from './pr-reviewer.js';
import type { PRReviewerInput } from './pr-reviewer.js';
import type { AgentContext, LLMProviderRef, TaskEntry, AgentLearning } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// Mock the learnings functions used internally by the helpers
const mockAddObservation = jest.fn();
const mockExpireObservation = jest.fn();
const mockReadLearnings = jest.fn();
const mockUpdateObservationConfidence = jest.fn();

jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual<typeof import('@agentforge/core')>('@agentforge/core');
  return {
    ...actual,
    addObservation: (...args: unknown[]) => mockAddObservation(...args),
    expireObservation: (...args: unknown[]) => mockExpireObservation(...args),
    readLearnings: (...args: unknown[]) => mockReadLearnings(...args),
    updateObservationConfidence: (...args: unknown[]) => mockUpdateObservationConfidence(...args),
  };
});

// ============================================================================
// Helpers
// ============================================================================

const APPROVE_REVIEW = `### Summary
This PR implements the RevenueChart component correctly per spec.

### Decision
APPROVE

### Comments
No critical issues found. Code follows all conventions.

### Spec Compliance
All fields match the spec. No deviations.`;

const REQUEST_CHANGES_REVIEW = `### Summary
This PR has a security issue in the API endpoint.

### Decision
REQUEST_CHANGES

### Comments
- **File**: src/routes/revenue.ts
- **Line**: 42
- **Severity**: critical
- **Issue**: Missing auth middleware on protected endpoint
- **Fix**: Add \`authMiddleware\` to the route chain

### Spec Compliance
Endpoint spec requires auth: "required" but middleware is missing.`;

const makeCostRecord = (totalCostUsd = 0.10) => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: 'claude-haiku-4-5',
  timestamp: new Date().toISOString(),
});

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_030',
  title: 'Review PR for RevenueChart',
  phase: 'code_generation',
  agent: 'pr_reviewer',
  status: 'in_progress',
  depends_on: ['task_001'],
  spec_ref: 'spec/components/dashboard.yaml',
  branch: null,
  pr_number: 42,
  cost_usd: 0,
  tokens_used: 0,
  attempts: 0,
  max_attempts: 1,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (output = APPROVE_REVIEW): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({
    content: output,
    cost: makeCostRecord(),
  })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const SPEC_YAML = `
version: "1.0"
page_id: "page_dashboard"
components:
  - id: "comp_revenue_chart"
    name: "RevenueChart"
    type: "data_visualization"
    status: "specced"
`;

const PR_DIFF = `diff --git a/src/components/revenue-chart.tsx b/src/components/revenue-chart.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/revenue-chart.tsx
@@ -0,0 +1,30 @@
+import { useQuery } from '@tanstack/react-query';
+export const RevenueChart = () => <div>Chart</div>;`;

const makeContext = (): AgentContext => ({
  taskId: 'task_030',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok(SPEC_YAML)),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_pr') {
        return Promise.resolve(Ok(PR_DIFF));
      }
      if (server === 'github' && method === 'create_review') {
        return Promise.resolve(Ok({ success: true }));
      }
      return Promise.resolve(Ok({ success: true }));
    }),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (): PRReviewerInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  stackConfigPath: '/tmp/stack/config.yaml',
  promptTemplatePath: '/tmp/stack/prompts/pr_review.md',
  prNumber: 42,
  specRef: 'spec/components/dashboard.yaml',
});

// ============================================================================
// parseReviewOutput Tests
// ============================================================================

describe('parseReviewOutput', () => {
  it('parses APPROVE decision', () => {
    const result = parseReviewOutput(APPROVE_REVIEW);
    expect(result.decision).toBe('APPROVE');
    expect(result.body).toContain('APPROVE');
  });

  it('parses REQUEST_CHANGES decision', () => {
    const result = parseReviewOutput(REQUEST_CHANGES_REVIEW);
    expect(result.decision).toBe('REQUEST_CHANGES');
    expect(result.body).toContain('Missing auth middleware');
  });

  it('defaults to APPROVE when no explicit decision marker', () => {
    const result = parseReviewOutput('Looks good overall. No issues found.');
    expect(result.decision).toBe('APPROVE');
  });
});

// ============================================================================
// prReviewerWork Tests
// ============================================================================

describe('prReviewerWork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock PR Review Prompt');
    // Default mocks for learnings functions called by promoteRecurringPatterns/createObservationsFromFeedback
    mockReadLearnings.mockResolvedValue({ ok: true, value: [] });
    mockAddObservation.mockResolvedValue({ ok: true, value: { id: 'obs_001' } });
    mockExpireObservation.mockResolvedValue({ ok: true, value: undefined });
    mockUpdateObservationConfidence.mockResolvedValue({ ok: true, value: undefined });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockReadLearnings.mockReset();
    mockAddObservation.mockReset();
    mockExpireObservation.mockReset();
    mockUpdateObservationConfidence.mockReset();
  });

  it('reads PR diff via MCP and posts approval review', async () => {
    const ctx = makeContext();
    const provider = makeProvider(APPROVE_REVIEW);
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prNumber).toBe(42);
      expect(result.value.decision).toBe('APPROVE');
      expect(result.value.totalCostUsd).toBe(0.10);
    }
  });

  it('posts REQUEST_CHANGES when review finds issues', async () => {
    const ctx = makeContext();
    const provider = makeProvider(REQUEST_CHANGES_REVIEW);
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.decision).toBe('REQUEST_CHANGES');
    }
  });

  it('calls MCP to read PR diff', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prReviewerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const readPrCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'read_pr',
    );
    expect(readPrCall).toBeDefined();
    expect(readPrCall![2]).toEqual({ pr_number: 42 });
  });

  it('calls MCP to post review', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prReviewerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const reviewCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_review',
    );
    expect(reviewCall).toBeDefined();
    expect(reviewCall![2].pr_number).toBe(42);
    expect(reviewCall![2].event).toBe('APPROVE');
  });

  it('uses provider.complete() not stream()', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prReviewerWork(input, provider, [], ctx);

    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it('emits ReviewComplete event on success', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prReviewerWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'ReviewComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { taskId: string }).taskId).toBe('task_030');
    expect((event![0] as { agentId: string }).agentId).toBe('pr_reviewer');
    expect((event![0] as { prNumber: number }).prNumber).toBe(42);
    expect((event![0] as { decision: string }).decision).toBe('APPROVE');
  });

  it('fails when PR cannot be read via MCP', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_pr') {
        return Promise.resolve(
          Err({ code: 'INVALID_STATE', message: 'PR not found', recoverable: true }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('PR #42');
    }
  });

  it('fails when spec file cannot be read', async () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue(
      Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });

  it('fails when LLM completion fails', async () => {
    const ctx = makeContext();
    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR', message: 'Rate limited', recoverable: true }),
      ),
      stream: jest.fn(),
      estimateCost: jest.fn().mockReturnValue({
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      }),
    };
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_API_ERROR');
    }
  });

  it('fails when posting review to MCP fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_pr') {
        return Promise.resolve(Ok(PR_DIFF));
      }
      if (server === 'github' && method === 'create_review') {
        return Promise.resolve(
          Err({ code: 'INVALID_STATE', message: 'API error', recoverable: true }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const result = await prReviewerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to post review');
    }
  });

  it('includes learnings in user message when provided', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();
    const learnings = [{ learning: 'Team prefers named exports', confidence: 'high' }];

    await prReviewerWork(input, provider, learnings, ctx);

    const completeCall = (provider.complete as jest.Mock).mock.calls[0];
    const promptMessages = completeCall[0].messages;
    const userMsg = promptMessages[0].content;
    expect(userMsg).toContain('named exports');
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('PR_REVIEWER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(PR_REVIEWER_CONTRACT.role).toBe('pr_reviewer');
    expect(PR_REVIEWER_CONTRACT.category).toBe('code');
  });

  it('uses complete execution mode (not streaming)', () => {
    expect(PR_REVIEWER_CONTRACT.execution.mode).toBe('complete');
    expect(PR_REVIEWER_CONTRACT.execution.progress_events).toBe(false);
  });

  it('uses claude-haiku-4-5 provider (fast, cost-effective)', () => {
    expect(PR_REVIEWER_CONTRACT.provider).toBe('claude-haiku-4-5');
  });

  it('uses review_and_override HITL policy', () => {
    expect(PR_REVIEWER_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('has $0.50 per-task budget', () => {
    expect(PR_REVIEWER_CONTRACT.budget.max_cost_per_task_usd).toBe(0.5);
  });

  it('has read-only permissions (no write_code)', () => {
    expect(PR_REVIEWER_CONTRACT.permissions).toContain('read_spec');
    expect(PR_REVIEWER_CONTRACT.permissions).toContain('read_code');
    expect(PR_REVIEWER_CONTRACT.permissions).not.toContain('write_code');
  });

  it('denies write_code, deploy, and merge permissions', () => {
    expect(PR_REVIEWER_CONTRACT.denied).toContain('write_code');
    expect(PR_REVIEWER_CONTRACT.denied).toContain('deploy_staging');
    expect(PR_REVIEWER_CONTRACT.denied).toContain('deploy_production');
    expect(PR_REVIEWER_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits ReviewComplete on completion', () => {
    expect(PR_REVIEWER_CONTRACT.on_complete).toBe('ReviewComplete');
  });

  it('specifies notify_human + pause error strategy (no retries)', () => {
    expect(PR_REVIEWER_CONTRACT.on_error).toBe('notify_human + pause');
  });
});

// ============================================================================
// Learnings Integration Tests
// ============================================================================

describe('extractFeedbackThemes', () => {
  it('extracts themes from structured review with **Issue** markers', () => {
    const body = `### Comments
- **File**: src/routes/revenue.ts
- **Issue**: Missing auth middleware on protected endpoint
- **Issue**: No input validation on request body`;

    const themes = extractFeedbackThemes(body);

    expect(themes).toHaveLength(2);
    expect(themes[0]).toBe('Missing auth middleware on protected endpoint');
    expect(themes[1]).toBe('No input validation on request body');
  });

  it('falls back to extracting sentences with convention keywords', () => {
    const body = `The code should use named exports instead of default exports.
    Also, you must add error handling for the database calls.
    Looks good otherwise.`;

    const themes = extractFeedbackThemes(body);

    expect(themes.length).toBeGreaterThan(0);
    expect(themes.some((t) => t.includes('named exports'))).toBe(true);
  });

  it('returns empty array for clean review with no issues', () => {
    const body = 'APPROVE\nAll good, no changes needed.';
    const themes = extractFeedbackThemes(body);
    expect(themes).toHaveLength(0);
  });
});

describe('createObservationsFromFeedback', () => {
  beforeEach(() => {
    mockAddObservation.mockReset();
  });

  it('creates high-confidence observations from feedback themes', async () => {
    mockAddObservation.mockResolvedValue(Ok({
      id: 'obs_001',
      date: '2026-03-18T00:00:00.000Z',
      source: 'human_feedback_on_task_030',
      learning: 'Missing auth middleware',
      confidence: 'high',
      taskRef: 'task_030',
      active: true,
    }));

    await createObservationsFromFeedback(
      'pr_reviewer',
      'task_030',
      ['Missing auth middleware', 'No input validation'],
      '/tmp/learnings',
    );

    expect(mockAddObservation).toHaveBeenCalledTimes(2);

    // Verify first call has correct structure
    const firstCall = mockAddObservation.mock.calls[0];
    expect(firstCall[0]).toBe('pr_reviewer');
    expect(firstCall[1]).toMatchObject({
      source: 'human_feedback_on_task_030',
      learning: 'Missing auth middleware',
      confidence: 'high',
      active: true,
    });

    // Verify second call
    const secondCall = mockAddObservation.mock.calls[1];
    expect(secondCall[1]).toMatchObject({
      learning: 'No input validation',
      confidence: 'high',
    });
  });
});

describe('handleContradictions', () => {
  beforeEach(() => {
    mockExpireObservation.mockReset();
  });

  it('expires existing learning when new feedback contradicts it', async () => {
    mockExpireObservation.mockResolvedValue(Ok(undefined));

    const existing: AgentLearning[] = [
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'pattern_detected',
        learning: 'Use default exports for components',
        confidence: 'medium',
        taskRef: null,
        active: true,
      },
    ];

    await handleContradictions(
      'pr_reviewer',
      ['Use named exports for all modules'],
      existing,
      '/tmp/learnings',
    );

    expect(mockExpireObservation).toHaveBeenCalledWith('pr_reviewer', 'obs_001', '/tmp/learnings');
  });

  it('does not expire when there is no contradiction', async () => {
    mockExpireObservation.mockResolvedValue(Ok(undefined));

    const existing: AgentLearning[] = [
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'pattern_detected',
        learning: 'Use Zod for validation',
        confidence: 'medium',
        taskRef: null,
        active: true,
      },
    ];

    await handleContradictions(
      'pr_reviewer',
      ['Missing auth middleware'],
      existing,
      '/tmp/learnings',
    );

    expect(mockExpireObservation).not.toHaveBeenCalled();
  });
});

describe('promoteRecurringPatterns', () => {
  beforeEach(() => {
    mockReadLearnings.mockReset();
    mockUpdateObservationConfidence.mockReset();
  });

  it('promotes medium to high confidence after 3+ occurrences from different tasks', async () => {
    mockReadLearnings.mockResolvedValue(Ok([
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'human_feedback_on_task_001',
        learning: 'use named exports',
        confidence: 'medium',
        taskRef: 'task_001',
        active: true,
      },
      {
        id: 'obs_002',
        date: '2026-03-02T00:00:00.000Z',
        source: 'human_feedback_on_task_002',
        learning: 'use named exports',
        confidence: 'medium',
        taskRef: 'task_002',
        active: true,
      },
      {
        id: 'obs_003',
        date: '2026-03-03T00:00:00.000Z',
        source: 'human_feedback_on_task_003',
        learning: 'use named exports',
        confidence: 'medium',
        taskRef: 'task_003',
        active: true,
      },
    ]));

    mockUpdateObservationConfidence.mockResolvedValue(Ok(undefined));

    await promoteRecurringPatterns('pr_reviewer', '/tmp/learnings');

    expect(mockUpdateObservationConfidence).toHaveBeenCalledTimes(3);
    expect(mockUpdateObservationConfidence).toHaveBeenCalledWith('pr_reviewer', 'obs_001', 'high', '/tmp/learnings');
    expect(mockUpdateObservationConfidence).toHaveBeenCalledWith('pr_reviewer', 'obs_002', 'high', '/tmp/learnings');
    expect(mockUpdateObservationConfidence).toHaveBeenCalledWith('pr_reviewer', 'obs_003', 'high', '/tmp/learnings');
  });

  it('does not promote when fewer than 3 unique tasks', async () => {
    mockReadLearnings.mockResolvedValue(Ok([
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'human_feedback_on_task_001',
        learning: 'use named exports',
        confidence: 'medium',
        taskRef: 'task_001',
        active: true,
      },
      {
        id: 'obs_002',
        date: '2026-03-02T00:00:00.000Z',
        source: 'human_feedback_on_task_002',
        learning: 'use named exports',
        confidence: 'medium',
        taskRef: 'task_002',
        active: true,
      },
    ]));

    mockUpdateObservationConfidence.mockResolvedValue(Ok(undefined));

    await promoteRecurringPatterns('pr_reviewer', '/tmp/learnings');

    expect(mockUpdateObservationConfidence).not.toHaveBeenCalled();
  });
});
