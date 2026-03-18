import {
  prManagerWork,
  PR_MANAGER_CONTRACT,
  buildPRDescription,
} from './pr-manager.js';
import type { PRManagerInput } from './pr-manager.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_010',
  title: 'Generate RevenueChart component',
  phase: 'code_generation',
  agent: 'frontend_coder',
  status: 'in_progress',
  depends_on: [],
  spec_ref: 'spec/components/dashboard.yaml',
  branch: 'agentforge/task-010-revenue-chart',
  pr_number: null,
  cost_usd: 0.42,
  tokens_used: 18400,
  attempts: 1,
  max_attempts: 3,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: '', cost: { totalCostUsd: 0 } })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 100,
    estimatedOutputTokens: 50,
    estimatedCostUsd: 0.001,
    confidence: 'high' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_010',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('')),
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
    callTool: jest.fn().mockResolvedValue(Ok({ number: 42, html_url: 'https://github.com/org/repo/pull/42' })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (overrides: Partial<PRManagerInput> = {}): PRManagerInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  branch: 'agentforge/task-010-revenue-chart',
  filesGenerated: ['src/components/revenue-chart.tsx', 'src/components/revenue-chart.test.tsx'],
  testResults: '2 tests passed, 0 failed',
  costUsd: 0.42,
  ...overrides,
});

// ============================================================================
// buildPRDescription
// ============================================================================

describe('buildPRDescription', () => {
  it('includes task metadata', () => {
    const input = makeInput();
    const body = buildPRDescription(input);

    expect(body).toContain('task_010');
    expect(body).toContain('Generate RevenueChart component');
    expect(body).toContain('spec/components/dashboard.yaml');
  });

  it('includes generated files', () => {
    const input = makeInput();
    const body = buildPRDescription(input);

    expect(body).toContain('revenue-chart.tsx');
    expect(body).toContain('revenue-chart.test.tsx');
  });

  it('includes test results', () => {
    const input = makeInput();
    const body = buildPRDescription(input);

    expect(body).toContain('2 tests passed');
  });

  it('includes cost', () => {
    const input = makeInput();
    const body = buildPRDescription(input);

    expect(body).toContain('$0.42');
  });

  it('includes design ref when present', () => {
    const input = makeInput({ designRef: 'figma://file123/node456' });
    const body = buildPRDescription(input);

    expect(body).toContain('figma://file123/node456');
  });

  it('omits design ref when absent', () => {
    const input = makeInput();
    const body = buildPRDescription(input);

    expect(body).not.toContain('Design');
  });
});

// ============================================================================
// prManagerWork
// ============================================================================

describe('prManagerWork', () => {
  it('creates PR via MCP with correct metadata', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    const result = await prManagerWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prNumber).toBe(42);
      expect(result.value.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(result.value.branch).toBe('agentforge/task-010-revenue-chart');
    }
  });

  it('calls MCP create_pr with title and body', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prManagerWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const prCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_pr',
    );
    expect(prCall).toBeDefined();
    expect(prCall![2].title).toContain('task_010');
    expect(prCall![2].head).toBe('agentforge/task-010-revenue-chart');
    expect(prCall![2].base).toBe('main');
  });

  it('emits PRCreated event', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await prManagerWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'PRCreated',
    );
    expect(event).toBeDefined();
    expect((event![0] as { prNumber: number }).prNumber).toBe(42);
    expect((event![0] as { taskId: string }).taskId).toBe('task_010');
  });

  it('fails when MCP create_pr fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockResolvedValue(
      Err({ code: 'INVALID_STATE', message: 'API error', recoverable: true }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await prManagerWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to create PR');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('PR_MANAGER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(PR_MANAGER_CONTRACT.role).toBe('pr_manager');
    expect(PR_MANAGER_CONTRACT.category).toBe('cicd');
  });

  it('has create_pr permission', () => {
    expect(PR_MANAGER_CONTRACT.permissions).toContain('create_pr');
  });

  it('denies merge_pr and deploy permissions', () => {
    expect(PR_MANAGER_CONTRACT.denied).toContain('merge_pr');
    expect(PR_MANAGER_CONTRACT.denied).toContain('deploy_staging');
    expect(PR_MANAGER_CONTRACT.denied).toContain('deploy_production');
  });

  it('emits PRCreated on completion', () => {
    expect(PR_MANAGER_CONTRACT.on_complete).toBe('PRCreated');
  });
});
