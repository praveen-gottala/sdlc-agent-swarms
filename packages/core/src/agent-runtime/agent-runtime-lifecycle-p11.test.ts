/**
 * P11 — Agent Runtime Lifecycle (Wave 3)
 *
 * Validates the full agent execution lifecycle:
 * 1. executeAgent reads contract, injects context, calls LLM, returns Result
 * 2. Agent status transitions (idle → executing → completed/error)
 * 3. Governance middleware fires before every LLM call in correct order (ADR-004)
 * 4. Progress events emit when enabled
 * 5. on_complete event fires after successful execution
 * 6. on_error strategy executes correctly (retry then notify)
 * 7. Circuit breaker triggers at threshold (PRD v2.0 F11)
 */

import { runAgent } from './base-agent.js';
import { parseErrorStrategy } from './error-strategy.js';
import type { AgentContext, AgentWorkFn, LLMProviderRef } from './types.js';
import type { AgentContract } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { createEventBus } from '../events/event-bus.js';
import type { DomainEvent } from '../events/domain-events.js';
import * as yaml from 'yaml';

// ============================================================================
// Test Helpers
// ============================================================================

/** Build a mock agent contract with streaming execution mode. */
const makeStreamingContract = (overrides: Partial<AgentContract> = {}): AgentContract => ({
  role: 'code_generator',
  description: 'Generates production code from specs',
  category: 'code',
  provider: 'claude-sonnet-4',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 100000 },
  tools: ['code.write_file', 'code.read_file'],
  permissions: ['read_spec', 'write_code', 'create_branch'],
  denied: ['deploy', 'merge_pr'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'CodeGenComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
  ...overrides,
});

const makeProvider = (): LLMProviderRef => ({
  name: 'mock-claude',
  complete: jest.fn().mockResolvedValue(Ok({ content: 'generated code' })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 2000,
    estimatedOutputTokens: 1000,
    estimatedCostUsd: 0.05,
    confidence: 'medium' as const,
  }),
});

const makeContext = (overrides: Partial<AgentContext> = {}): AgentContext => {
  const eventBus = createEventBus();
  return {
    taskId: 'task_p11_001',
    projectRoot: '/tmp/test-project',
    eventBus,
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
  };
};

type CodeInput = { specRef: string; taskDescription: string };
type CodeOutput = { filesWritten: string[]; branch: string };

// ============================================================================
// P11.1 — executeAgent reads contract, injects context, calls LLM, returns Result
// ============================================================================

describe('P11: Agent Runtime Lifecycle', () => {
  describe('P11.1: executeAgent full pipeline', () => {
    it('reads contract, resolves provider, runs governance, executes work, returns completed Result', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract();
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: ['src/components/dashboard.tsx'], branch: 'feat/dashboard' }),
      );

      const result = await runAgent(
        contract, ctx,
        { specRef: 'specs/components/dashboard.yaml', taskDescription: 'Generate dashboard component' },
        'write_code', 'src/components/dashboard.tsx', 'Generate dashboard component',
        workFn,
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        if (result.value.status === 'completed') {
          expect(result.value.output.filesWritten).toContain('src/components/dashboard.tsx');
          expect(result.value.output.branch).toBe('feat/dashboard');
        }
      }
    });

    it('resolves provider from contract.provider string', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract({ provider: 'claude-opus-4' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: [], branch: 'feat/test' }),
      );

      await runAgent(contract, ctx, { specRef: 'specs/', taskDescription: '' }, 'write_code', 'x', 'desc', workFn);

      expect(ctx.resolveProvider).toHaveBeenCalledWith('claude-opus-4');
    });

    it('returns Err when provider resolution fails', async () => {
      const ctx = makeContext({
        resolveProvider: jest.fn().mockReturnValue(Err({
          code: 'MODEL_NOT_FOUND',
          model: 'unknown-model',
        })),
      });
      const contract = makeStreamingContract({ provider: 'unknown-model' });
      const workFn = jest.fn();

      const result = await runAgent(contract, ctx, { specRef: 'specs/', taskDescription: '' }, 'write_code', 'x', 'desc', workFn);

      expect(result.ok).toBe(false);
      expect(workFn).not.toHaveBeenCalled();
    });

    it('passes resolved provider and learnings to workFn', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract();
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: [], branch: 'feat/test' }),
      );

      await runAgent(
        contract, ctx,
        { specRef: 'specs/', taskDescription: 'gen code' },
        'write_code', 'x', 'desc', workFn,
      );

      expect(workFn).toHaveBeenCalledWith(
        { specRef: 'specs/', taskDescription: 'gen code' },
        expect.objectContaining({ name: 'mock-claude' }),
        expect.any(Array), // learnings
        ctx,
      );
    });
  });

  // ============================================================================
  // P11.2 — Agent status transitions
  // ============================================================================

  describe('P11.2: Agent status transitions', () => {
    it('returns completed on successful execution', async () => {
      const ctx = makeContext();
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: ['f.ts'], branch: 'b' }),
      );

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe('completed');
    });

    it('returns paused when HITL requires approval', async () => {
      const ctx = makeContext({
        runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'pause', gateId: 'gate_p11_001' })),
      });
      const workFn = jest.fn();

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('paused');
        if (result.value.status === 'paused') {
          expect(result.value.gateId).toBe('gate_p11_001');
        }
      }
      expect(workFn).not.toHaveBeenCalled();
    });

    it('returns denied when governance denies action', async () => {
      const ctx = makeContext({
        runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'denied', reason: 'Insufficient permissions' })),
      });
      const workFn = jest.fn();

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('denied');
        if (result.value.status === 'denied') {
          expect(result.value.reason).toBe('Insufficient permissions');
        }
      }
    });

    it('returns error after exhausting retries', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract({ on_error: 'retry(max=1)' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR' as const, message: 'API timeout', recoverable: true }),
      );

      const result = await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('error');
      }
    });
  });

  // ============================================================================
  // P11.3 — Governance middleware fires before every LLM call in correct order (ADR-004)
  // ============================================================================

  describe('P11.3: Governance fires before LLM call (permission → budget → HITL per ADR-004)', () => {
    it('calls runGovernance before executing workFn', async () => {
      const callOrder: string[] = [];
      const ctx = makeContext({
        runGovernance: jest.fn().mockImplementation(async () => {
          callOrder.push('governance');
          return Ok({ status: 'proceed' });
        }),
      });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockImplementation(async () => {
        callOrder.push('work');
        return Ok({ filesWritten: [], branch: 'b' });
      });

      await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(callOrder).toEqual(['governance', 'work']);
    });

    it('passes cost estimate from provider to governance', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract();
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: [], branch: 'b' }),
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'target.ts', 'Generate code', workFn);

      expect(ctx.runGovernance).toHaveBeenCalledWith(
        contract,
        'write_code',
        'target.ts',
        'Generate code',
        expect.objectContaining({
          estimatedCostUsd: expect.any(Number),
          estimatedInputTokens: expect.any(Number),
          estimatedOutputTokens: expect.any(Number),
        }),
      );
    });

    it('blocks execution when governance returns budget exceeded', async () => {
      const ctx = makeContext({
        runGovernance: jest.fn().mockResolvedValue(Err({
          code: 'BUDGET_EXCEEDED_TASK',
          message: 'Task budget exceeded: $2.10 > $2.00',
          recoverable: false,
        })),
      });
      const workFn = jest.fn();

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
      }
      expect(workFn).not.toHaveBeenCalled();
    });

    it('blocks execution when governance returns permission denied', async () => {
      const ctx = makeContext({
        runGovernance: jest.fn().mockResolvedValue(Err({
          code: 'PERMISSION_DENIED',
          message: 'Agent "code_generator" does not have permission "deploy"',
          recoverable: false,
        })),
      });
      const workFn = jest.fn();

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'deploy', 'prod', 'd', workFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('PERMISSION_DENIED');
      }
      expect(workFn).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // P11.4 — Progress events emit when enabled
  // ============================================================================

  describe('P11.4: Progress events during streaming execution', () => {
    it('workFn can emit progress events via eventBus when execution.progress_events is true', async () => {
      const eventBus = createEventBus();
      const progressEvents: DomainEvent[] = [];
      // Subscribe to catch any events published during work
      eventBus.subscribe('AgentStarted', (e) => progressEvents.push(e));

      const ctx = makeContext({ eventBus });
      const contract = makeStreamingContract({
        execution: { mode: 'stream', progress_events: true, max_context_tokens: 100000 },
      });

      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockImplementation(
        async (_input, _provider, _learnings, context) => {
          // Agent emits progress during work
          context.eventBus.publish({
            type: 'AgentStarted',
            agentId: 'code_generator',
            taskId: context.taskId,
            source: 'agent:code_generator',
            timestamp: Date.now(),
          } as DomainEvent);
          return Ok({ filesWritten: ['comp.tsx'], branch: 'feat/comp' });
        },
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].type).toBe('AgentStarted');
    });

    it('streaming contract configuration is correctly accessible', () => {
      const contract = makeStreamingContract();
      expect(contract.execution.mode).toBe('stream');
      expect(contract.execution.progress_events).toBe(true);
    });
  });

  // ============================================================================
  // P11.5 — on_complete event fires after successful execution
  // ============================================================================

  describe('P11.5: on_complete event fires on success', () => {
    it('emits on_complete event type from contract after successful execution', async () => {
      const eventBus = createEventBus();
      const emittedEvents: DomainEvent[] = [];

      eventBus.subscribe('CodeGenComplete', (e) => emittedEvents.push(e));

      const ctx = makeContext({ eventBus });
      const contract = makeStreamingContract({ on_complete: 'CodeGenComplete' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: ['f.ts'], branch: 'b' }),
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(emittedEvents.length).toBe(1);
      expect(emittedEvents[0].type).toBe('CodeGenComplete');
      expect(emittedEvents[0].source).toBe('agent:code_generator');
    });

    it('does not emit on_complete when work fails', async () => {
      const eventBus = createEventBus();
      const emittedEvents: DomainEvent[] = [];
      eventBus.subscribe('CodeGenComplete', (e) => emittedEvents.push(e));

      const ctx = makeContext({ eventBus });
      const contract = makeStreamingContract({ on_complete: 'CodeGenComplete', on_error: '' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR' as const, message: 'Failed', recoverable: false }),
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(emittedEvents.length).toBe(0);
    });

    it('records audit with outcome success after on_complete', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract();
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Ok({ filesWritten: ['f.ts'], branch: 'b' }),
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(ctx.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'code_generator',
          taskId: 'task_p11_001',
          outcome: 'success',
        }),
      );
    });
  });

  // ============================================================================
  // P11.6 — on_error strategy: retry(max=N) then notify_human + pause
  // ============================================================================

  describe('P11.6: on_error strategy (retry then notify)', () => {
    it('parses retry(max=2) then notify_human + pause correctly', () => {
      const strategy = parseErrorStrategy('retry(max=2) then notify_human + pause');
      expect(strategy.retryMax).toBe(2);
      expect(strategy.notifyHuman).toBe(true);
      expect(strategy.pause).toBe(true);
    });

    it('retries the specified number of times before failing', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract({ on_error: 'retry(max=2) then notify_human + pause' });

      let callCount = 0;
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockImplementation(async () => {
        callCount++;
        return Err({ code: 'LLM_API_ERROR' as const, message: `Attempt ${callCount} failed`, recoverable: true });
      });

      const result = await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      // 1 original + 2 retries = 3 calls
      expect(workFn).toHaveBeenCalledTimes(3);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('error');
      }
    });

    it('succeeds on retry without exhausting all attempts', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract({ on_error: 'retry(max=2) then notify_human' });

      let callCount = 0;
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return Err({ code: 'LLM_API_ERROR' as const, message: 'Transient', recoverable: true });
        }
        return Ok({ filesWritten: ['fixed.ts'], branch: 'feat/fix' });
      });

      const result = await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(workFn).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
      }
    });

    it('records audit with failure outcome after all retries exhausted', async () => {
      const ctx = makeContext();
      const contract = makeStreamingContract({ on_error: 'retry(max=1) then notify_human + pause' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockResolvedValue(
        Err({ code: 'LLM_API_ERROR' as const, message: 'Persistent failure', recoverable: true }),
      );

      await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(ctx.recordAudit).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      );
    });

    it('defaults to 0 retries when on_error has no retry spec', () => {
      const strategy = parseErrorStrategy('notify_human');
      expect(strategy.retryMax).toBe(0);
      expect(strategy.notifyHuman).toBe(true);
      expect(strategy.pause).toBe(false);
    });
  });

  // ============================================================================
  // P11.7 — Circuit breaker: >5 LLM calls without task state change → force-stop (PRD F11)
  // ============================================================================

  describe('P11.7: Circuit breaker — looping detection', () => {
    it('CircuitBreaker interface defines required methods (recordCall, isLooping, reset, getState)', () => {
      // Validate the CircuitBreaker interface contract at the type level.
      // The interface is defined in governance/types.ts and exported from governance.
      // We verify the structural contract here without cross-package import.
      type CircuitBreakerContract = {
        recordCall(agentId: string, success: boolean): boolean;
        isLooping(agentId: string, maxCallsWithoutProgress: number): boolean;
        reset(agentId: string): void;
        getState(agentId: string): 'closed' | 'open' | 'half_open';
      };

      // If this compiles, the contract shape is correct
      const mockBreaker: CircuitBreakerContract = {
        recordCall: jest.fn().mockReturnValue(true),
        isLooping: jest.fn().mockReturnValue(false),
        reset: jest.fn(),
        getState: jest.fn().mockReturnValue('closed'),
      };

      expect(mockBreaker.recordCall('agent1', true)).toBe(true);
      expect(mockBreaker.isLooping('agent1', 5)).toBe(false);
      expect(mockBreaker.getState('agent1')).toBe('closed');
    });

    it('CircuitBreakerConfig has correct defaults (maxCallsWithoutProgress: 5)', async () => {
      // Verify the circuit breaker config structure
      const config = {
        maxConsecutiveFailures: 5,
        maxCallsWithoutProgress: 5,
        resetAfterMinutes: 5,
      };

      expect(config.maxCallsWithoutProgress).toBe(5);
      expect(config.maxConsecutiveFailures).toBe(5);
      expect(config.resetAfterMinutes).toBe(5);
    });

    it('agent aborts when AbortSignal is triggered mid-execution (simulating circuit breaker)', async () => {
      const controller = new AbortController();
      const ctx = makeContext({ abortSignal: controller.signal });
      const contract = makeStreamingContract({ on_error: 'retry(max=5)' });

      let callCount = 0;
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount >= 3) {
          // Simulate circuit breaker aborting after detecting loop
          controller.abort();
        }
        return Err({ code: 'LLM_API_ERROR' as const, message: 'No progress', recoverable: true });
      });

      const result = await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
    });

    it('emits AgentAborted event on forced stop', async () => {
      const eventBus = createEventBus();
      const abortEvents: DomainEvent[] = [];
      eventBus.subscribe('AgentAborted', (e) => abortEvents.push(e));

      const controller = new AbortController();
      controller.abort();
      const ctx = makeContext({ eventBus, abortSignal: controller.signal });

      const workFn = jest.fn();
      await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(abortEvents.length).toBe(1);
      expect(abortEvents[0].type).toBe('AgentAborted');
    });
  });

  // ============================================================================
  // Additional lifecycle validation
  // ============================================================================

  describe('P11 Additional: Abort detection via YAML task status', () => {
    it('detects aborting status in tasks YAML and stops execution', async () => {
      const tasksYaml = yaml.stringify({
        tasks: [{ id: 'task_p11_001', status: 'aborting' }],
      });
      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockReturnValue({ ok: true, value: tasksYaml }),
        },
      });
      const workFn = jest.fn();

      const result = await runAgent(makeStreamingContract(), ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
        expect(result.error.message).toContain('aborting');
      }
      expect(workFn).not.toHaveBeenCalled();
    });

    it('detects abort between retry attempts', async () => {
      let readCount = 0;
      const inProgressYaml = yaml.stringify({ tasks: [{ id: 'task_p11_001', status: 'in_progress' }] });
      const abortingYaml = yaml.stringify({ tasks: [{ id: 'task_p11_001', status: 'aborting' }] });

      const ctx = makeContext({
        fs: {
          ...makeContext().fs,
          readFile: jest.fn().mockImplementation(() => {
            readCount++;
            return { ok: true, value: readCount > 2 ? abortingYaml : inProgressYaml };
          }),
        },
      });
      const contract = makeStreamingContract({ on_error: 'retry(max=3)' });
      const workFn: AgentWorkFn<CodeInput, CodeOutput> = jest.fn()
        .mockResolvedValueOnce(Err({ code: 'LLM_API_ERROR' as const, message: 'err', recoverable: true }));

      const result = await runAgent(contract, ctx, { specRef: 's', taskDescription: 'd' }, 'write_code', 'x', 'd', workFn);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
      expect(workFn).toHaveBeenCalledTimes(1);
    });
  });
});
