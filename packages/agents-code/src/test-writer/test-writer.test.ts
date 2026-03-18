import {
  testWriterWork,
  TEST_WRITER_CONTRACT,
} from './test-writer.js';
import type { TestWriterInput } from './test-writer.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { StreamChunk } from '@agentforge/providers';

// ============================================================================
// Helpers
// ============================================================================

const VALID_TEST_CODE = `\`\`\`typescript
import { render, screen } from '@testing-library/react';
import { RevenueChart } from './revenue-chart';

describe('RevenueChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state initially', () => {
    render(<RevenueChart dateRange={{ start: '2026-01-01', end: '2026-03-01' }} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('renders revenue data after loading', async () => {
    render(<RevenueChart dateRange={{ start: '2026-01-01', end: '2026-03-01' }} />);
    expect(await screen.findByText('Revenue')).toBeInTheDocument();
  });
});
\`\`\``;

const makeCostRecord = (totalCostUsd = 0.40) => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: 'claude-sonnet-4',
  timestamp: new Date().toISOString(),
});

const makeStreamChunks = (content: string, cost = makeCostRecord()): StreamChunk[] => [
  { type: 'token', content, tokenCount: 100 },
  { type: 'done', usage: { inputTokens: 500, outputTokens: 200 }, cost },
];

async function* mockStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task_020',
  title: 'Write tests for RevenueChart',
  phase: 'code_generation',
  agent: 'test_writer',
  status: 'in_progress',
  depends_on: ['task_001'],
  spec_ref: 'spec/components/dashboard.yaml',
  branch: null,
  pr_number: null,
  cost_usd: 0,
  tokens_used: 0,
  attempts: 0,
  max_attempts: 3,
  hitl_status: 'none',
  hitl_channel: null,
  ...overrides,
});

const makeProvider = (output = VALID_TEST_CODE): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn().mockReturnValue(mockStream(makeStreamChunks(output))),
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

const makeContext = (): AgentContext => ({
  taskId: 'task_020',
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
      if (server === 'github' && method === 'read_file') {
        return Promise.resolve(Ok('export const RevenueChart = () => <div>Chart</div>;'));
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

const makeInput = (): TestWriterInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  stackConfigPath: '/tmp/stack/config.yaml',
  promptTemplatePath: '/tmp/stack/prompts/test_unit.md',
  targetBranch: 'agentforge/task-task_001-revenue-chart',
  sourceFiles: ['src/components/revenue-chart.tsx'],
});

// ============================================================================
// testWriterWork Tests
// ============================================================================

describe('testWriterWork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock Test Prompt');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates test files and pushes to existing branch', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.branch).toBe('agentforge/task-task_001-revenue-chart');
      expect(result.value.testFilesGenerated).toContain('src/components/revenue-chart.test.tsx');
      expect(result.value.totalAttempts).toBe(1);
    }
  });

  it('reads source code from target branch via MCP', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await testWriterWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const readCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'read_file',
    );
    expect(readCall).toBeDefined();
    expect(readCall![2]).toEqual({
      branch: 'agentforge/task-task_001-revenue-chart',
      path: 'src/components/revenue-chart.tsx',
    });
  });

  it('pushes to EXISTING branch (does not create a new branch)', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await testWriterWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;

    // Should NOT call create_branch
    const branchCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_branch',
    );
    expect(branchCall).toBeUndefined();

    // Should call push_files to existing branch
    const pushCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'push_files',
    );
    expect(pushCall).toBeDefined();
    expect(pushCall![2].branch).toBe('agentforge/task-task_001-revenue-chart');
  });

  it('emits TestsComplete event on success', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await testWriterWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'TestsComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { taskId: string }).taskId).toBe('task_020');
    expect((event![0] as { agentId: string }).agentId).toBe('test_writer');
  });

  it('retries when generated tests lack describe blocks (F1 self-test)', async () => {
    const badOutput = '```typescript\nconst x = 1;\n```';
    const goodOutput = VALID_TEST_CODE;

    const streamCallCount = { count: 0 };
    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn(),
      stream: jest.fn().mockImplementation(() => {
        streamCallCount.count++;
        if (streamCallCount.count === 1) {
          return mockStream(makeStreamChunks(badOutput));
        }
        return mockStream(makeStreamChunks(goodOutput));
      }),
      estimateCost: jest.fn().mockReturnValue({
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      }),
    };

    const ctx = makeContext();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it('fails when spec file cannot be read', async () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue(
      Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });

  it('fails when no source files can be read from branch', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_file') {
        return Promise.resolve(
          Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No source files could be read');
    }
  });

  it('fails when push to branch fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation((server: string, method: string) => {
      if (server === 'github' && method === 'read_file') {
        return Promise.resolve(Ok('export const Foo = () => <div />;'));
      }
      if (server === 'github' && method === 'push_files') {
        return Promise.resolve(
          Err({ code: 'GIT_PUSH_FAILED', message: 'Push rejected', recoverable: true }),
        );
      }
      return Promise.resolve(Ok({ success: true }));
    });
    const provider = makeProvider();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GIT_PUSH_FAILED');
    }
  });

  it('tracks cumulative cost across retry attempts', async () => {
    const costPerAttempt = 0.80;
    const badOutput = '```typescript\nconst x: any = 5;\n```';

    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn(),
      stream: jest.fn().mockImplementation(() =>
        mockStream(makeStreamChunks(badOutput, makeCostRecord(costPerAttempt))),
      ),
      estimateCost: jest.fn().mockReturnValue({
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
        estimatedCostUsd: 0.01,
        confidence: 'medium' as const,
      }),
    };

    const ctx = makeContext();
    const input = makeInput();

    const result = await testWriterWork(input, provider, [], ctx);

    // 3 attempts at $0.80 = $2.40 > $2.00 budget → BUDGET_EXCEEDED_TASK
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('TEST_WRITER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(TEST_WRITER_CONTRACT.role).toBe('test_writer');
    expect(TEST_WRITER_CONTRACT.category).toBe('code');
  });

  it('uses streaming execution mode', () => {
    expect(TEST_WRITER_CONTRACT.execution.mode).toBe('stream');
    expect(TEST_WRITER_CONTRACT.execution.progress_events).toBe(true);
  });

  it('uses notify_only HITL policy (tests dont need approval)', () => {
    expect(TEST_WRITER_CONTRACT.hitl_policy).toBe('notify_only');
  });

  it('has $2.00 per-task budget', () => {
    expect(TEST_WRITER_CONTRACT.budget.max_cost_per_task_usd).toBe(2.0);
  });

  it('has required permissions', () => {
    expect(TEST_WRITER_CONTRACT.permissions).toContain('read_spec');
    expect(TEST_WRITER_CONTRACT.permissions).toContain('read_code');
    expect(TEST_WRITER_CONTRACT.permissions).toContain('write_code');
  });

  it('denies deploy and merge permissions', () => {
    expect(TEST_WRITER_CONTRACT.denied).toContain('deploy_staging');
    expect(TEST_WRITER_CONTRACT.denied).toContain('deploy_production');
    expect(TEST_WRITER_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits TestsComplete on completion', () => {
    expect(TEST_WRITER_CONTRACT.on_complete).toBe('TestsComplete');
  });
});
