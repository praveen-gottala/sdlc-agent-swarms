import { runAgent, formatLearningsForPrompt } from './base-agent.js';
import type { AgentContext, AgentWorkFn, LLMProviderRef } from './types.js';
import type { AgentContract, AgentLearning } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { DEFAULT_MODEL } from '../constants.js';
import * as yaml from 'yaml';

// ============================================================================
// Helpers
// ============================================================================

const makeContract = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'test_agent',
  description: 'Test agent',
  category: 'spec',
  provider: DEFAULT_MODEL,
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
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
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

  // ADR-032: non-recoverable errors skip retries
  it('does not retry when work returns recoverable: false even if on_error allows retry', async () => {
    const ctx = makeContext();
    const contract = makeContract({ on_error: 'retry(max=2) then notify_human' });

    const work: AgentWorkFn<TestInput, TestOutput> = jest.fn().mockResolvedValue(
      Err({
        code: 'DEPENDENCY_NOT_FOUND' as const,
        message: 'Required design tokens missing on disk',
        recoverable: false,
      }),
    );

    const result = await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

    expect(work).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('error');
      if (result.value.status === 'error') {
        expect(result.value.error.code).toBe('DEPENDENCY_NOT_FOUND');
        expect(result.value.error.recoverable).toBe(false);
      }
    }
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

  describe('checkAbort via YAML', () => {
    it('aborts when task status is aborting in YAML', async () => {
      const tasksYaml = yaml.stringify({
        tasks: [{ id: 'task_001', status: 'aborting' }],
      });
      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockReturnValue({ ok: true, value: tasksYaml }),
        },
      });
      const work = jest.fn();

      const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
        expect(result.error.message).toContain('aborting');
      }
      expect(work).not.toHaveBeenCalled();
    });

    it('aborts when task status is aborted in YAML', async () => {
      const tasksYaml = yaml.stringify({
        tasks: [{ id: 'task_001', status: 'aborted' }],
      });
      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockReturnValue({ ok: true, value: tasksYaml }),
        },
      });
      const work = jest.fn();

      const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
    });

    it('continues when task status is in_progress in YAML', async () => {
      const tasksYaml = yaml.stringify({
        tasks: [{ id: 'task_001', status: 'in_progress' }],
      });
      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockReturnValue({ ok: true, value: tasksYaml }),
        },
      });

      const result = await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', successWork);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('emits AgentAborted event and records audit on abort', async () => {
      const controller = new AbortController();
      controller.abort();
      const ctx = makeContext({ abortSignal: controller.signal });

      await runAgent(makeContract(), ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', jest.fn());

      expect(ctx.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AgentAborted' }),
      );
      expect(ctx.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'aborted' }),
      );
    });

    it('detects abort during retry loop', async () => {
      let readCount = 0;
      const inProgressYaml = yaml.stringify({ tasks: [{ id: 'task_001', status: 'in_progress' }] });
      const abortingYaml = yaml.stringify({ tasks: [{ id: 'task_001', status: 'aborting' }] });

      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockImplementation(() => {
            readCount++;
            // After a couple reads, return aborting
            return { ok: true, value: readCount > 2 ? abortingYaml : inProgressYaml };
          }),
        },
      });
      const contract = makeContract({ on_error: 'retry(max=3)' });

      const work: AgentWorkFn<TestInput, TestOutput> = jest.fn()
        .mockResolvedValueOnce(Err({ code: 'LLM_API_ERROR' as const, message: 'err', recoverable: true }));

      const result = await runAgent(contract, ctx, { specRef: 'specs/' }, 'write_spec', 'x', 'desc', work);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
      // Should have called work only once before detecting abort on retry
      expect(work).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// formatLearningsForPrompt Tests
// ============================================================================

describe('formatLearningsForPrompt', () => {
  it('returns empty string when no learnings', () => {
    expect(formatLearningsForPrompt([])).toBe('');
  });

  it('formats learnings as Team Conventions section', () => {
    const learnings: AgentLearning[] = [
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'human_feedback_on_task_001',
        learning: 'Team prefers named exports',
        confidence: 'high',
        taskRef: 'task_001',
        active: true,
      },
      {
        id: 'obs_002',
        date: '2026-03-02T00:00:00.000Z',
        source: 'pattern_detected',
        learning: 'Use Zod for all input validation',
        confidence: 'medium',
        taskRef: null,
        active: true,
      },
    ];

    const result = formatLearningsForPrompt(learnings);

    expect(result).toContain('## Team Conventions');
    expect(result).toContain('Based on past work on this project:');
    expect(result).toContain('Team prefers named exports');
    expect(result).toContain('(confidence: high)');
    expect(result).toContain('Use Zod for all input validation');
    expect(result).toContain('(confidence: medium)');
  });

  it('includes learning text in the formatted output', () => {
    const learnings: AgentLearning[] = [
      {
        id: 'obs_001',
        date: '2026-03-01T00:00:00.000Z',
        source: 'pattern_detected',
        learning: 'Always use async/await over raw promises',
        confidence: 'high',
        taskRef: null,
        active: true,
      },
    ];

    const result = formatLearningsForPrompt(learnings);

    expect(result).toContain('Always use async/await over raw promises');
  });
});
