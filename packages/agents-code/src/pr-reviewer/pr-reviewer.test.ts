import {
  prReviewerWork,
  PR_REVIEWER_CONTRACT,
  parseReviewOutput,
} from './pr-reviewer.js';
import type { PRReviewerInput } from './pr-reviewer.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

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
  model: 'claude-haiku-4',
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
  eventBus: { publish: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn() },
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('uses claude-haiku-4 provider (fast, cost-effective)', () => {
    expect(PR_REVIEWER_CONTRACT.provider).toBe('claude-haiku-4');
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
