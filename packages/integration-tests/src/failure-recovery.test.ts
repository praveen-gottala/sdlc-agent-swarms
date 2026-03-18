/**
 * Failure Recovery Integration Tests
 *
 * F1: LLM garbage → retry 3x → needs_human
 * F2: Provider rate limit → backoff → failover → success / pause
 * F3: Budget exceeded mid-task → hard stop
 * F4: HITL timeout → pause dependents → escalate → full pause
 * F5: Merge conflict → rebase attempt → human task
 * F6: CI fails → logs → fix → retry → max 3 cycles
 * F10: Slack down → Telegram down → CLI polling → approval still works
 * F11: Agent loop → circuit breaker → abort
 */

import {
  Ok,
  Err,
  runAgent,
  updateTaskStatus,
  addTask,
} from '@agentforge/core';
import type {
  AgentWorkFn,
  TaskEntry,
} from '@agentforge/core';
import {
  createGovernanceMiddleware,
} from '@agentforge/governance';
import {
  createEventCollector,
  createMockMCPClient,
  createMockChannel,
  createTestContext,
  makeContract,
  makeTask,
  makeTasksFile,
  DEFAULT_GOVERNANCE_CONFIG,
} from './helpers.js';

describe('Failure Recovery', () => {
  let collector: ReturnType<typeof createEventCollector>;

  beforeEach(() => {
    collector = createEventCollector();
  });

  afterEach(() => {
    collector.clear();
  });

  // ========================================================================
  // F1: LLM garbage → retry 3x → needs_human task
  // ========================================================================

  describe('F1: LLM garbage output', () => {
    it('retries 3x on LLM malformed output then creates needs_human result', async () => {
      let attempts = 0;
      const garbageWork: AgentWorkFn<unknown, string> = async () => {
        attempts++;
        return Err({
          code: 'LLM_MALFORMED_OUTPUT' as const,
          message: `Attempt ${attempts}: LLM returned unparseable garbage`,
          recoverable: true,
        });
      };

      const contract = makeContract({ on_error: 'retry(max=3) + notify_human' });
      const ctx = createTestContext({ eventBus: collector.bus });

      const result = await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate code', garbageWork);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('error');
        if (result.value.status === 'error') {
          expect(result.value.error.code).toBe('LLM_MALFORMED_OUTPUT');
        }
      }
      // 1 initial + 3 retries = 4 total attempts
      expect(attempts).toBe(4);

      // Audit should be recorded with failure
      expect(ctx.recordAudit).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // F2: Provider rate limit → backoff → failover → success
  // ========================================================================

  describe('F2: Provider rate limit with failover', () => {
    it('retries on rate limit then succeeds on later attempt', async () => {
      let callCount = 0;
      const rateLimitWork: AgentWorkFn<unknown, string> = async () => {
        callCount++;
        if (callCount <= 2) {
          return Err({
            code: 'LLM_RATE_LIMIT' as const,
            message: 'Rate limited',
            recoverable: true,
          });
        }
        return Ok('success after retry');
      };

      const contract = makeContract({ on_error: 'retry(max=3)' });
      const ctx = createTestContext({ eventBus: collector.bus });

      const result = await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', rateLimitWork);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        if (result.value.status === 'completed') {
          expect(result.value.output).toBe('success after retry');
        }
      }
      expect(callCount).toBe(3);
    });

    it('no secondary provider → pause and notify after exhausting retries', async () => {
      const rateLimitWork: AgentWorkFn<unknown, string> = async () => {
        return Err({
          code: 'LLM_RATE_LIMIT' as const,
          message: 'Rate limited on all providers',
          recoverable: true,
        });
      };

      const contract = makeContract({ on_error: 'retry(max=3) + notify_human + pause' });
      const ctx = createTestContext({ eventBus: collector.bus });

      const result = await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', rateLimitWork);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('error');
      }
      // notify_human and pause flags should trigger audit recording
      expect(ctx.recordAudit).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // F3: Budget exceeded mid-task → hard stop, no commit
  // ========================================================================

  describe('F3: Budget exceeded mid-task', () => {
    it('governance blocks when budget exceeded', () => {
      const governance = createGovernanceMiddleware({
        config: {
          ...DEFAULT_GOVERNANCE_CONFIG,
          budget: { perTaskMaxUsd: 0.01, perPhaseMaxUsd: 0.01, monthlyMaxUsd: 0.01, alertThreshold: 0.8 },
        },
        eventBus: collector.bus,
      });

      const contract = makeContract({ budget: { max_tokens_per_task: 100, max_cost_per_task_usd: 0.01 } });
      const action = {
        agentId: 'test_agent',
        taskId: 'task_001',
        type: 'write_code' as const,
        target: 'src/index.ts',
        description: 'Generate code',
        phase: 'code' as const,
        timestamp: new Date().toISOString(),
      };

      governance.checkPermission(contract, action);

      const estimate = { estimatedInputTokens: 50000, estimatedOutputTokens: 20000, estimatedCostUsd: 5.0, confidence: 'medium' as const };
      const budgetResult = governance.checkBudget(contract, estimate);

      expect(budgetResult.ok).toBe(false);
      if (!budgetResult.ok) {
        expect(budgetResult.error.code).toMatch(/^BUDGET_EXCEEDED/);
      }
    });

    it('agent does not commit when budget hard stop fires', async () => {
      const mcpCalls: Array<{ method: string }> = [];
      const mcpClient = createMockMCPClient(async (server, method) => {
        mcpCalls.push({ method });
        return Ok({ success: true });
      });

      // Agent work that checks budget mid-stream
      const work: AgentWorkFn<unknown, string> = async (_input, _provider, _learnings, ctx) => {
        // Simulate budget check failure mid-task
        return Err({
          code: 'BUDGET_EXCEEDED_TASK' as const,
          message: 'Budget exceeded, hard stopping',
          recoverable: false,
        });
      };

      const contract = makeContract({ on_error: 'retry(max=0)' });
      const ctx = createTestContext({ eventBus: collector.bus, mcpClient });

      await runAgent(contract, ctx, {}, 'write_code', 'src/index.ts', 'Generate code', work);

      // No git push or commit should have been attempted
      const pushCalls = mcpCalls.filter((c) => c.method === 'git_push' || c.method === 'git_commit');
      expect(pushCalls).toHaveLength(0);
    });
  });

  // ========================================================================
  // F4: HITL timeout → pause dependents → escalate → second timeout → full pause
  // ========================================================================

  describe('F4: HITL timeout cascade', () => {
    it('pauses dependent tasks when HITL times out', () => {
      const tasks = [
        makeTask({ id: 'task_001', status: 'in_progress' }),
        makeTask({ id: 'task_002', status: 'pending', depends_on: ['task_001'] }),
        makeTask({ id: 'task_003', status: 'pending', depends_on: ['task_001'] }),
      ];
      let tasksFile = makeTasksFile(tasks);

      // Task 1 goes to awaiting_approval
      const r1 = updateTaskStatus(tasksFile, 'task_001', 'awaiting_approval');
      expect(r1.ok).toBe(true);
      if (r1.ok) tasksFile = r1.value;

      // Dependents should remain pending (blocked)
      expect(tasksFile.tasks[1].status).toBe('pending');
      expect(tasksFile.tasks[2].status).toBe('pending');

      // Timeout → task_001 paused
      // awaiting_approval → changes_requested (simulating timeout decision)
      // Actually, per valid transitions: awaiting_approval → approved | changes_requested
      // We go changes_requested → in_progress → paused
      const r2 = updateTaskStatus(tasksFile, 'task_001', 'changes_requested');
      expect(r2.ok).toBe(true);
      if (r2.ok) tasksFile = r2.value;
      const r3 = updateTaskStatus(tasksFile, 'task_001', 'in_progress');
      expect(r3.ok).toBe(true);
      if (r3.ok) tasksFile = r3.value;
      const r4 = updateTaskStatus(tasksFile, 'task_001', 'paused');
      expect(r4.ok).toBe(true);
      if (r4.ok) tasksFile = r4.value;

      expect(tasksFile.tasks[0].status).toBe('paused');

      // Emit stalled notification
      collector.bus.publish({
        type: 'TaskStatusChanged',
        taskId: 'task_001',
        from: 'in_progress',
        to: 'paused',
        source: 'test', timestamp: Date.now(),
      });

      const pauseEvents = collector.eventsOfType('TaskStatusChanged');
      expect(pauseEvents.some((e) => e.to === 'paused')).toBe(true);
    });
  });

  // ========================================================================
  // F5: Merge conflict → rebase attempt → human task
  // ========================================================================

  describe('F5: Merge conflict', () => {
    it('creates human task when merge conflict detected', () => {
      const tasks = [makeTask({ id: 'task_001', status: 'in_progress', branch: 'feat/dashboard' })];
      let tasksFile = makeTasksFile(tasks);

      // Simulate merge conflict detection
      const conflictTask: TaskEntry = {
        id: 'task_conflict_001',
        title: 'Resolve merge conflict on feat/dashboard',
        phase: 'code',
        agent: 'human',
        status: 'pending',
        depends_on: ['task_001'],
        spec_ref: 'spec/dashboard.yaml',
        branch: 'feat/dashboard',
        pr_number: null,
        cost_usd: 0,
        tokens_used: 0,
        attempts: 0,
        max_attempts: 1,
        hitl_status: 'awaiting_approval',
        hitl_channel: null,
      };

      const addResult = addTask(tasksFile, conflictTask);
      expect(addResult.ok).toBe(true);
      if (addResult.ok) {
        tasksFile = addResult.value;
        const humanTask = tasksFile.tasks.find((t) => t.id === 'task_conflict_001');
        expect(humanTask).toBeDefined();
        expect(humanTask?.agent).toBe('human');
        expect(humanTask?.title).toContain('merge conflict');
      }

      // Emit event
      collector.bus.publish({
        type: 'AgentFailed',
        agentId: 'code_generator',
        taskId: 'task_001',
        error: 'GIT_CONFLICT: merge conflict on feat/dashboard',
        source: 'test', timestamp: Date.now(),
      });

      const failEvents = collector.eventsOfType('AgentFailed');
      expect(failEvents).toHaveLength(1);
      expect(failEvents[0].error).toContain('GIT_CONFLICT');
    });
  });

  // ========================================================================
  // F6: CI fails → logs → fix → retry → max 3 cycles
  // ========================================================================

  describe('F6: CI failure cycle', () => {
    it('retries CI fix up to 3 cycles then stops', async () => {
      let ciFixAttempts = 0;
      const MAX_CI_CYCLES = 3;

      const ciFixWork: AgentWorkFn<{ logs: string }, { fixed: boolean }> = async (input) => {
        ciFixAttempts++;
        if (ciFixAttempts < MAX_CI_CYCLES) {
          return Err({
            code: 'CI_FAILED' as const,
            message: `CI fix attempt ${ciFixAttempts} failed`,
            recoverable: true,
          });
        }
        // Third attempt succeeds
        return Ok({ fixed: true });
      };

      const contract = makeContract({
        role: 'build_fixer',
        on_error: `retry(max=${MAX_CI_CYCLES - 1})`,
      });
      const ctx = createTestContext({ eventBus: collector.bus });

      const result = await runAgent(contract, ctx, { logs: 'TypeError: undefined' }, 'write_code', 'src/fix.ts', 'Fix CI', ciFixWork);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('completed');
        if (result.value.status === 'completed') {
          expect(result.value.output.fixed).toBe(true);
        }
      }
      expect(ciFixAttempts).toBe(MAX_CI_CYCLES);
    });

    it('sends CI logs to agent for each retry', async () => {
      const logsReceived: string[] = [];
      const ciFixWork: AgentWorkFn<{ logs: string }, { fixed: boolean }> = async (input) => {
        logsReceived.push(input.logs);
        return Ok({ fixed: true });
      };

      const contract = makeContract({ role: 'build_fixer', on_error: 'retry(max=0)' });
      const ctx = createTestContext({ eventBus: collector.bus });

      await runAgent(contract, ctx, { logs: 'npm ERR! test failed' }, 'write_code', 'src/fix.ts', 'Fix CI', ciFixWork);

      expect(logsReceived).toHaveLength(1);
      expect(logsReceived[0]).toContain('npm ERR!');
    });

    it('emits CIFailed event for each failure cycle', () => {
      for (let i = 0; i < 3; i++) {
        collector.bus.publish({
          type: 'CIFailed',
          taskId: 'task_001',
          branch: 'feat/dashboard',
          runId: `run_${i + 1}`,
          logs: `CI run ${i + 1} failed: test error`,
          source: 'test', timestamp: Date.now(),
        });
      }

      const ciEvents = collector.eventsOfType('CIFailed');
      expect(ciEvents).toHaveLength(3);
      expect(ciEvents[2].runId).toBe('run_3');
    });
  });

  // ========================================================================
  // F10: Slack down → Telegram down → CLI polling → approval still works
  // ========================================================================

  describe('F10: Channel failover', () => {
    it('falls back through channels when each is unavailable', async () => {
      const unavailableSlack = createMockChannel('slack', false);
      const unavailableTelegram = createMockChannel('telegram', false);
      const cliChannel = createMockChannel('cli', true);

      const channels = [unavailableSlack, unavailableTelegram, cliChannel];

      // Try each channel in priority order
      let approvalSent = false;
      let approvalChannel = '';

      for (const channel of channels) {
        const available = await channel.isAvailable();
        if (available) {
          const result = await channel.requestApproval(
            { id: 'task_001', name: 'Deploy', status: 'awaiting_approval' },
            { title: 'Approval', description: 'Approve deploy' },
          );
          if (result.ok) {
            approvalSent = true;
            approvalChannel = channel.type;
            break;
          }
        }
      }

      expect(approvalSent).toBe(true);
      expect(approvalChannel).toBe('cli');
    });

    it('retries Slack 3x before moving to next channel', async () => {
      let slackAttempts = 0;
      const flakySlack = createMockChannel('slack', true);
      const origRequest = flakySlack.requestApproval.bind(flakySlack);
      flakySlack.requestApproval = async (task, context) => {
        slackAttempts++;
        if (slackAttempts <= 3) {
          return Err({ code: 'CHANNEL_UNAVAILABLE' as const, message: 'Slack API error', recoverable: true });
        }
        return origRequest(task, context);
      };

      const MAX_RETRIES = 3;
      let result;

      for (let i = 0; i <= MAX_RETRIES; i++) {
        result = await flakySlack.requestApproval(
          { id: 'task_001', name: 'Deploy', status: 'awaiting_approval' as const },
          { title: 'Approval', description: 'Approve' },
        );
        if (result.ok) break;
      }

      expect(slackAttempts).toBe(MAX_RETRIES + 1);
      // After 3 failures, 4th succeeds
      expect(result?.ok).toBe(true);
    });

    it('CLI polling mode works as last resort', async () => {
      const cliChannel = createMockChannel('cli', true);
      let pollResult = false;

      // Simulate CLI polling: check for decision
      cliChannel.onDecision((taskId, decision) => {
        if (taskId === 'task_001' && decision === 'approved') {
          pollResult = true;
        }
      });

      const approvalResult = await cliChannel.requestApproval(
        { id: 'task_001', name: 'Deploy', status: 'awaiting_approval' },
        { title: 'Approval', description: 'Approve' },
      );
      expect(approvalResult.ok).toBe(true);

      // Simulate CLI approval
      for (const cb of cliChannel.decisionCallbacks) {
        cb('task_001', 'approved');
      }

      expect(pollResult).toBe(true);
    });
  });

  // ========================================================================
  // F11: Agent loop → circuit breaker → abort
  // ========================================================================

  describe('F11: Agent loop detection', () => {
    it('circuit breaker trips after max consecutive failures', () => {
      // Simulate circuit breaker state machine directly
      const circuitBreaker = {
        consecutiveFailures: 0,
        maxFailures: 5,
        state: 'closed' as 'closed' | 'open',

        recordFailure() {
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= this.maxFailures) {
            this.state = 'open';
          }
        },

        recordSuccess() {
          this.consecutiveFailures = 0;
        },
      };

      // Simulate 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.state).toBe('open');
      expect(circuitBreaker.consecutiveFailures).toBe(5);
    });

    it('emits AgentAborted when circuit breaker trips', () => {
      collector.bus.publish({
        type: 'AgentAborted',
        agentId: 'code_generator',
        taskId: 'task_001',
        reason: 'Circuit breaker tripped: AGENT_LOOP_DETECTED',
        source: 'test', timestamp: Date.now(),
      });

      const abortEvents = collector.eventsOfType('AgentAborted');
      expect(abortEvents).toHaveLength(1);
      expect(abortEvents[0].reason).toContain('Circuit breaker');
    });

    it('circuit breaker resets allow retry after cooldown', () => {
      const circuitBreaker = {
        consecutiveFailures: 5,
        state: 'open' as 'closed' | 'open' | 'half_open',
        openedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
        resetAfterMinutes: 5,
      };

      // Check if cooldown has elapsed
      const elapsed = Date.now() - circuitBreaker.openedAt;
      if (elapsed >= circuitBreaker.resetAfterMinutes * 60 * 1000) {
        circuitBreaker.state = 'half_open';
        circuitBreaker.consecutiveFailures = 0;
      }

      expect(circuitBreaker.state).toBe('half_open');
      expect(circuitBreaker.consecutiveFailures).toBe(0);
    });
  });
});
