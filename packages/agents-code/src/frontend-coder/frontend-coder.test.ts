import {
  frontendCoderWork,
  FRONTEND_CODER_CONTRACT,
  toKebabCase,
  extractCodeFromOutput,
  collectStreamOutput,
} from './frontend-coder.js';
import type { FrontendCoderInput } from './frontend-coder.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err, DEFAULT_MODEL } from '@agentforge/core';
import type { StreamChunk } from '@agentforge/providers';

// ============================================================================
// Helpers
// ============================================================================

const VALID_COMPONENT = `\`\`\`tsx
import { useQuery } from '@tanstack/react-query';

interface RevenueChartProps {
  readonly dateRange: { start: string; end: string };
}

export const RevenueChart = ({ dateRange }: RevenueChartProps) => {
  const { data, isLoading } = useQuery({
    queryKey: ['revenue', dateRange],
    queryFn: () => fetch('/api/revenue').then(r => r.json()),
  });

  if (isLoading) return <div className="animate-pulse" />;

  return (
    <div className="p-4 rounded-lg bg-white shadow">
      <h2 className="text-lg font-semibold">Revenue</h2>
      <pre>{JSON.stringify(data)}</pre>
    </div>
  );
};
\`\`\``;

const makeCostRecord = (totalCostUsd = 0.50) => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: DEFAULT_MODEL,
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
  id: 'task_001',
  title: 'Generate RevenueChart component',
  phase: 'code_generation',
  agent: 'frontend_coder',
  status: 'in_progress',
  depends_on: [],
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

const makeProvider = (output = VALID_COMPONENT): LLMProviderRef => ({
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
    design_ref: "figma://file123/node456"
    props:
      - name: "dateRange"
        type: "DateRange"
        required: true
    data_source: "api:GET /api/revenue"
`;

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
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
    callTool: jest.fn().mockResolvedValue(Ok({ code: '<div>Design Context</div>' })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (): FrontendCoderInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  stackConfigPath: '/tmp/stack/config.yaml',
  promptTemplatePath: '/tmp/stack/prompts/frontend_component.md',
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('toKebabCase', () => {
  it('converts PascalCase to kebab-case', () => {
    expect(toKebabCase('RevenueChart')).toBe('revenue-chart');
    expect(toKebabCase('ActivityFeed')).toBe('activity-feed');
    expect(toKebabCase('QuickActions')).toBe('quick-actions');
    expect(toKebabCase('HTMLParser')).toBe('html-parser');
  });
});

describe('extractCodeFromOutput', () => {
  it('extracts code from tsx code block', () => {
    const output = '```tsx\nconst Foo = () => <div />;\n```';
    expect(extractCodeFromOutput(output)).toBe('const Foo = () => <div />;');
  });

  it('returns trimmed input when no code block found', () => {
    expect(extractCodeFromOutput('  plain code  ')).toBe('plain code');
  });
});

describe('collectStreamOutput', () => {
  it('collects token chunks into content string', async () => {
    const chunks = makeStreamChunks('hello world');
    const result = await collectStreamOutput(mockStream(chunks));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('hello world');
      expect(result.value.cost.totalCostUsd).toBe(0.50);
    }
  });

  it('returns error when stream has no done chunk', async () => {
    async function* noEnd(): AsyncIterable<StreamChunk> {
      yield { type: 'token', content: 'partial', tokenCount: 10 };
    }

    const result = await collectStreamOutput(noEnd());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_API_ERROR');
    }
  });
});

// ============================================================================
// frontendCoderWork Tests
// ============================================================================

describe('frontendCoderWork', () => {
  // Mock readFileSync for prompt template and stack config
  beforeEach(() => {
    jest.resetModules();
    // We need to mock readFileSync for the template/config loading
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock Prompt Template');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates code and creates branch via MCP', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    const result = await frontendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.branch).toBe('agentforge/task-task_001-revenue-chart');
      expect(result.value.filesGenerated).toContain('src/components/revenue-chart.tsx');
      expect(result.value.totalAttempts).toBe(1);
    }
  });

  it('calls MCP to create branch and push files', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await frontendCoderWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;

    // Should call figma.get_code for design context
    const figmaCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'figma' && call[1] === 'get_code',
    );
    expect(figmaCall).toBeDefined();
    expect(figmaCall![2]).toEqual({ fileId: 'file123', nodeId: 'node456' });

    // Should call github.create_branch
    const branchCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_branch',
    );
    expect(branchCall).toBeDefined();

    // Should call github.push_files
    const pushCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'push_files',
    );
    expect(pushCall).toBeDefined();
  });

  it('emits CodeGenComplete event on success', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await frontendCoderWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const codeGenEvent = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'CodeGenComplete',
    );
    expect(codeGenEvent).toBeDefined();
    expect((codeGenEvent![0] as { taskId: string }).taskId).toBe('task_001');
    expect((codeGenEvent![0] as { branch: string }).branch).toBe(
      'agentforge/task-task_001-revenue-chart',
    );
  });

  it('retries when generated code uses default export (F1 self-test)', async () => {
    const badOutput = '```tsx\nexport default function Foo() { return <div />; }\n```';
    const goodOutput = VALID_COMPONENT;

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

    const result = await frontendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    // Should have called stream twice (first failed self-test, second passed)
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it('fails when spec file cannot be read', async () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue(
      Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await frontendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });

  it('fails when MCP branch creation fails', async () => {
    const ctx = makeContext();
    (ctx.mcpClient.callTool as jest.Mock).mockImplementation(
      (server: string, method: string) => {
        if (server === 'github' && method === 'create_branch') {
          return Promise.resolve(
            Err({ code: 'GIT_PUSH_FAILED', message: 'Branch exists', recoverable: true }),
          );
        }
        return Promise.resolve(Ok({ code: '<div />' }));
      },
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await frontendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GIT_PUSH_FAILED');
    }
  });

  it('tracks cumulative cost across retry attempts', async () => {
    const costPerAttempt = 1.20;
    const badOutput = '```tsx\nconst x: any = 5;\n```';

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

    const result = await frontendCoderWork(input, provider, [], ctx);

    // Self-test always fails (any type). After 2 attempts: $1.20 * 2 = $2.40.
    // 3rd attempt adds $1.20 = $3.60 > $3.00 budget → BUDGET_EXCEEDED_TASK.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('FRONTEND_CODER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(FRONTEND_CODER_CONTRACT.role).toBe('frontend_coder');
    expect(FRONTEND_CODER_CONTRACT.category).toBe('code');
  });

  it('uses streaming execution mode', () => {
    expect(FRONTEND_CODER_CONTRACT.execution.mode).toBe('stream');
    expect(FRONTEND_CODER_CONTRACT.execution.progress_events).toBe(true);
  });

  it('uses review_and_override HITL policy', () => {
    expect(FRONTEND_CODER_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('has $3.00 per-task budget', () => {
    expect(FRONTEND_CODER_CONTRACT.budget.max_cost_per_task_usd).toBe(3.0);
  });

  it('has required permissions', () => {
    expect(FRONTEND_CODER_CONTRACT.permissions).toContain('read_spec');
    expect(FRONTEND_CODER_CONTRACT.permissions).toContain('read_design');
    expect(FRONTEND_CODER_CONTRACT.permissions).toContain('write_code');
    expect(FRONTEND_CODER_CONTRACT.permissions).toContain('create_branch');
  });

  it('denies deploy and merge permissions', () => {
    expect(FRONTEND_CODER_CONTRACT.denied).toContain('deploy_staging');
    expect(FRONTEND_CODER_CONTRACT.denied).toContain('deploy_production');
    expect(FRONTEND_CODER_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits CodeGenComplete on completion', () => {
    expect(FRONTEND_CODER_CONTRACT.on_complete).toBe('CodeGenComplete');
  });

  it('specifies retry(max=3) error strategy', () => {
    expect(FRONTEND_CODER_CONTRACT.on_error).toContain('retry(max=3)');
  });
});
