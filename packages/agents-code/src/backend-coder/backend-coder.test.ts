import {
  backendCoderWork,
  BACKEND_CODER_CONTRACT,
} from './backend-coder.js';
import type { BackendCoderInput } from './backend-coder.js';
import type { AgentContext, LLMProviderRef, TaskEntry } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { StreamChunk } from '@agentforge/providers';

// ============================================================================
// Helpers
// ============================================================================

const VALID_ENDPOINT = `\`\`\`typescript
import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const GetRevenueQuerySchema = z.object({
  start_date: z.string(),
  end_date: z.string().optional(),
});

interface RevenueDataPoint {
  readonly date: string;
  readonly amount: number;
}

const prisma = new PrismaClient();

export const getRevenue = async (req: Request, res: Response) => {
  const query = GetRevenueQuerySchema.parse(req.query);
  const data = await prisma.revenueEntry.findMany({
    where: { date: { gte: new Date(query.start_date) } },
  });
  res.json(data);
};

export const revenueRouter = Router();
revenueRouter.get('/revenue', getRevenue);
\`\`\``;

const makeCostRecord = (totalCostUsd = 0.50) => ({
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
  id: 'task_010',
  title: 'Generate revenue API endpoint',
  phase: 'code_generation',
  agent: 'backend_coder',
  status: 'in_progress',
  depends_on: [],
  spec_ref: 'ep_get_revenue',
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

const makeProvider = (output = VALID_ENDPOINT): LLMProviderRef => ({
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

const API_SPEC_YAML = `
version: "1.0"
base_url: "/api"
endpoints:
  - id: "ep_get_revenue"
    method: "GET"
    path: "/api/revenue"
    query_params:
      - name: "start_date"
        type: "string"
        format: "ISO8601"
    response:
      type: "RevenueDataPoint[]"
      schema_ref: "models:RevenueDataPoint"
    auth: "required"
    status: "specced"
`;

const MODELS_SPEC_YAML = `
version: "1.0"
models:
  - id: "model_revenue"
    name: "RevenueDataPoint"
    fields:
      - name: "date"
        type: "DateTime"
        nullable: false
      - name: "amount"
        type: "Decimal"
        precision: 10
        scale: 2
    db_table: "revenue_entries"
`;

const makeContext = (): AgentContext => ({
  taskId: 'task_010',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn() },
  fs: {
    readFile: jest.fn().mockImplementation((path: string) => {
      if (path.includes('api.yaml')) return Ok(API_SPEC_YAML);
      if (path.includes('models.yaml')) return Ok(MODELS_SPEC_YAML);
      return Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false });
    }),
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
    callTool: jest.fn().mockResolvedValue(Ok({ success: true })),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

const makeInput = (): BackendCoderInput => ({
  task: makeTask(),
  projectRoot: '/tmp/test-project',
  stackConfigPath: '/tmp/stack/config.yaml',
  promptTemplatePath: '/tmp/stack/prompts/backend_endpoint.md',
});

// ============================================================================
// backendCoderWork Tests
// ============================================================================

describe('backendCoderWork', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(require('node:fs'), 'readFileSync').mockReturnValue('# Mock Backend Prompt');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates endpoint code and creates branch via MCP', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    const result = await backendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.branch).toBe('agentforge/task-task_010-revenue');
      expect(result.value.filesGenerated).toContain('src/routes/revenue.ts');
      expect(result.value.totalAttempts).toBe(1);
    }
  });

  it('calls MCP to create branch and push files', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await backendCoderWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;

    const branchCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'create_branch',
    );
    expect(branchCall).toBeDefined();

    const pushCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'github' && call[1] === 'push_files',
    );
    expect(pushCall).toBeDefined();
    expect(pushCall![2].files[0].path).toBe('src/routes/revenue.ts');
  });

  it('does NOT call figma MCP (backend coder has no read_design permission)', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await backendCoderWork(input, provider, [], ctx);

    const mcpCalls = (ctx.mcpClient.callTool as jest.Mock).mock.calls;
    const figmaCall = mcpCalls.find(
      (call: unknown[]) => call[0] === 'figma',
    );
    expect(figmaCall).toBeUndefined();
  });

  it('emits CodeGenComplete event on success', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();

    await backendCoderWork(input, provider, [], ctx);

    const publishCalls = (ctx.eventBus.publish as jest.Mock).mock.calls;
    const event = publishCalls.find(
      (call: unknown[]) => (call[0] as { type: string }).type === 'CodeGenComplete',
    );
    expect(event).toBeDefined();
    expect((event![0] as { taskId: string }).taskId).toBe('task_010');
    expect((event![0] as { agentId: string }).agentId).toBe('backend_coder');
  });

  it('retries when generated code lacks Zod validation (F1 self-test)', async () => {
    const noZodOutput = '```typescript\nexport const handler = (req: Request, res: Response) => { res.json({}); };\n```';
    const goodOutput = VALID_ENDPOINT;

    const streamCallCount = { count: 0 };
    const provider: LLMProviderRef = {
      name: 'test-provider',
      complete: jest.fn(),
      stream: jest.fn().mockImplementation(() => {
        streamCallCount.count++;
        if (streamCallCount.count === 1) {
          return mockStream(makeStreamChunks(noZodOutput));
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

    const result = await backendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(true);
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });

  it('fails when api.yaml cannot be read', async () => {
    const ctx = makeContext();
    (ctx.fs.readFile as jest.Mock).mockReturnValue(
      Err({ code: 'INVALID_STATE', message: 'File not found', recoverable: false }),
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await backendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });

  it('fails when endpoint not found in api.yaml', async () => {
    const ctx = makeContext();
    const input = makeInput();
    input.task.spec_ref;
    const taskWithBadRef = { ...makeTask(), spec_ref: 'nonexistent_endpoint' };

    const result = await backendCoderWork(
      { ...input, task: taskWithBadRef },
      makeProvider(),
      [],
      ctx,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('No endpoint found');
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
        return Promise.resolve(Ok({ success: true }));
      },
    );
    const provider = makeProvider();
    const input = makeInput();

    const result = await backendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GIT_PUSH_FAILED');
    }
  });

  it('tracks cumulative cost across retry attempts', async () => {
    const costPerAttempt = 1.20;
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

    const result = await backendCoderWork(input, provider, [], ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }
  });

  it('includes learnings in user message when provided', async () => {
    const ctx = makeContext();
    const provider = makeProvider();
    const input = makeInput();
    const learnings = [{ learning: 'Use custom error middleware', confidence: 'high' }];

    await backendCoderWork(input, provider, learnings, ctx);

    const streamCall = (provider.stream as jest.Mock).mock.calls[0];
    const promptMessages = streamCall[0].messages;
    const userMsg = promptMessages[0].content;
    expect(userMsg).toContain('custom error middleware');
  });
});

// ============================================================================
// Contract Tests
// ============================================================================

describe('BACKEND_CODER_CONTRACT', () => {
  it('has correct role and category', () => {
    expect(BACKEND_CODER_CONTRACT.role).toBe('backend_coder');
    expect(BACKEND_CODER_CONTRACT.category).toBe('code');
  });

  it('uses streaming execution mode', () => {
    expect(BACKEND_CODER_CONTRACT.execution.mode).toBe('stream');
    expect(BACKEND_CODER_CONTRACT.execution.progress_events).toBe(true);
  });

  it('uses review_and_override HITL policy', () => {
    expect(BACKEND_CODER_CONTRACT.hitl_policy).toBe('review_and_override');
  });

  it('has $3.00 per-task budget', () => {
    expect(BACKEND_CODER_CONTRACT.budget.max_cost_per_task_usd).toBe(3.0);
  });

  it('has required permissions (no read_design)', () => {
    expect(BACKEND_CODER_CONTRACT.permissions).toContain('read_spec');
    expect(BACKEND_CODER_CONTRACT.permissions).toContain('read_code');
    expect(BACKEND_CODER_CONTRACT.permissions).toContain('write_code');
    expect(BACKEND_CODER_CONTRACT.permissions).toContain('create_branch');
    expect(BACKEND_CODER_CONTRACT.permissions).not.toContain('read_design');
  });

  it('denies read_design, deploy, and merge permissions', () => {
    expect(BACKEND_CODER_CONTRACT.denied).toContain('read_design');
    expect(BACKEND_CODER_CONTRACT.denied).toContain('deploy_staging');
    expect(BACKEND_CODER_CONTRACT.denied).toContain('deploy_production');
    expect(BACKEND_CODER_CONTRACT.denied).toContain('merge_pr');
  });

  it('emits CodeGenComplete on completion', () => {
    expect(BACKEND_CODER_CONTRACT.on_complete).toBe('CodeGenComplete');
  });

  it('specifies retry(max=3) error strategy', () => {
    expect(BACKEND_CODER_CONTRACT.on_error).toContain('retry(max=3)');
  });
});
