import { runAgent } from './base-agent.js';
import type { AgentContext, AgentWorkFn, LLMProviderRef } from './types.js';
import type { AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';

// ============================================================================
// Helpers
// ============================================================================

const makeContract = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'test_agent',
  description: 'Test agent',
  category: 'spec',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 100000 },
  tools: [],
  permissions: ['read_spec', 'write_spec'],
  denied: [],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'SpecComplete',
  on_error: '',
  context: {},
  ...overrides,
});

const makeProvider = (): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: 'ok' })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeContext = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn() },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(false),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockResolvedValue(Ok({})),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
  ...overrides,
});

type TestInput = { specRef: string };
type TestOutput = { filesWritten: string[] };

const successWork: AgentWorkFn<TestInput, TestOutput> = jest.fn().mockResolvedValue(
  Ok({ filesWritten: ['api.yaml'] }),
);

// ============================================================================
// Tests
// ============================================================================

describe('runAgent', () => {
  it('calls runGovernance with correct args', async () => {
    const ctx = makeContext();
    const contract = makeContract();

    await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'specs/api.yaml', 'Write API spec', successWork);

    expect(ctx.runGovernance).toHaveBeenCalledWith(
      contract,
      'write_spec',
      'specs/api.yaml',
      'Write API spec',
      expect.objectContaining({ estimatedCostUsd: expect.any(Number) }),
    );
  });

  it('blocks when governance returns Err', async () => {
    const ctx = makeContext({
      runGovernance: jest.fn().mockResolvedValue(Err({
        code: 'BUDGET_EXCEEDED_TASK',
        message: 'Budget exceeded',
        recoverable: false,
      })),
    });
    const work = jest.fn();

    const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(false);
    expect(work).not.toHaveBeenCalled();
  });

  it('returns paused when governance returns pause', async () => {
    const ctx = makeContext({
      runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'pause', gateId: 'gate_123' })),
    });
    const work = jest.fn();

    const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('paused');
      if (result.value.status === 'paused') {
        expect(result.value.gateId).toBe('gate_123');
      }
    }
    expect(work).not.toHaveBeenCalled();
  });

  it('returns denied when governance returns denied', async () => {
    const ctx = makeContext({
      runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'denied', reason: 'Not allowed' })),
    });
    const work = jest.fn();

    const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('denied');
      if (result.value.status === 'denied') {
        expect(result.value.reason).toBe('Not allowed');
      }
    }
    expect(work).not.toHaveBeenCalled();
  });

  it('returns AGENT_ABORTED when abort signal is set', async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeContext({ abortSignal: controller.signal });
    const work = jest.fn();

    const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('AGENT_ABORTED');
    }
    expect(work).not.toHaveBeenCalled();
  });

  it('passes learnings to workFn', async () => {
    const ctx = makeContext();
    const work: AgentWorkFn<TestInput, TestOutput> = jest.fn().mockResolvedValue(
      Ok({ filesWritten: ['api.yaml'] }),
    );

    await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    // learnings will be [] since the file doesn't exist, but they should be passed
    expect(work).toHaveBeenCalledWith(
      { specRef: 'specs/' },
      expect.objectContaining({ name: expect.any(String) }),
      expect.any(Array),
      ctx,
    );
  });

  it('retries on error when on_error has retry', async () => {
    const ctx = makeContext();
    const contract = makeContract({ on_error: 'retry(max=2)' });

    let callCount = 0;
    const work: AgentWorkFn<TestInput, TestOutput> = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return Err({
          code: 'LLM_API_ERROR' as const,
          message: 'Transient error',
          recoverable: true,
        });
      }
      return Ok({ filesWritten: ['api.yaml'] });
    });

    const result = await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('completed');
    }
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('emits on_complete event and records audit on success', async () => {
    const ctx = makeContext();
    const contract = makeContract({ on_complete: 'SpecComplete' });

    await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', successWork);

    expect(ctx.eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SpecComplete' }),
    );
    expect(ctx.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' }),
    );
  });

  it('returns error after all retries exhausted', async () => {
    const ctx = makeContext();
    const contract = makeContract({ on_error: 'retry(max=1) then notify_human' });

    const work: AgentWorkFn<TestInput, TestOutput> = jest.fn().mockResolvedValue(
      Err({ code: 'LLM_API_ERROR' as const, message: 'Failed', recoverable: true }),
    );

    const result = await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('error');
    }
    expect(work).toHaveBeenCalledTimes(2); // 1 original + 1 retry
  });
});
