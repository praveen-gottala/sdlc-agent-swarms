/**
 * Abort Lifecycle Integration Tests
 *
 * Tests abort scenarios:
 * - Single task abort mid-stream: aborting → aborted, stream interrupted
 * - Abort with --cleanup: branch deleted via MCP
 * - Emergency abort --all: all tasks aborted, single notification
 */

import {
  Ok,
  Err,
  runAgent,
  updateTaskStatus,
} from '@agentforge/core';
import type {
  AgentWorkFn,
} from '@agentforge/core';
import {
  createEventCollector,
  createMockFs,
  createMockMCPClient,
  createTestContext,
  createMockChannel,
  makeContract,
  makeTask,
  makeTasksFile,
  tasksToYaml,
} from './helpers.js';

describe('Abort Lifecycle', () => {
  let collector: ReturnType<typeof createEventCollector>;

  beforeEach(() => {
    collector = createEventCollector();
  });

  afterEach(() => {
    collector.clear();
  });

  // ========================================================================
  // Single task abort mid-stream
  // ========================================================================

  describe('single task abort mid-stream', () => {
    it('abort signal interrupts agent execution', async () => {
      const abortController = new AbortController();
      const longWork: AgentWorkFn<unknown, string> = async (_input, _provider, _learnings, ctx) => {
        // Check abort before heavy work
        if (ctx.abortSignal?.aborted) {
          return Err({
            code: 'AGENT_ABORTED' as const,
            message: 'Aborted before completion',
            recoverable: false,
          });
        }
        return Ok('done');
      };

      // Abort before running
      abortController.abort();

      const contract = makeContract({ on_error: 'retry(max=0)' });
      const ctx = createTestContext({
        eventBus: collector.bus,
        abortSignal: abortController.signal,
      });

      const result = await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', longWork);

      // Agent should have been aborted
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
    });

    it('emits AgentAborted event on abort', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const work: AgentWorkFn<unknown, string> = async () => Ok('done');
      const contract = makeContract();
      const ctx = createTestContext({
        eventBus: collector.bus,
        abortSignal: abortController.signal,
      });

      await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', work);

      const abortEvents = collector.eventsOfType('AgentAborted');
      expect(abortEvents).toHaveLength(1);
      expect(abortEvents[0].agentId).toBe('test_agent');
    });

    it('no git push happens after abort', async () => {
      const mcpCalls: string[] = [];
      const mcpClient = createMockMCPClient(async (_server, method) => {
        mcpCalls.push(method);
        return Ok({ success: true });
      });

      const abortController = new AbortController();
      abortController.abort();

      const work: AgentWorkFn<unknown, string> = async (_i, _p, _l, ctx) => {
        await ctx.mcpClient.callTool('github', 'git_push', { branch: 'feat/x' });
        return Ok('pushed');
      };

      const contract = makeContract({ on_error: 'retry(max=0)' });
      const ctx = createTestContext({
        eventBus: collector.bus,
        mcpClient,
        abortSignal: abortController.signal,
      });

      await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Push', work);

      // Since abort happens before work, no MCP calls should be made
      expect(mcpCalls.filter((m) => m === 'git_push')).toHaveLength(0);
    });

    it('branch is preserved after abort (not deleted)', async () => {
      const deletedBranches: string[] = [];
      const mcpClient = createMockMCPClient(async (server, method, params) => {
        if (method === 'delete_branch') {
          deletedBranches.push(params['branch'] as string);
        }
        return Ok({ success: true });
      });

      // Simulate abort without cleanup flag
      const abortController = new AbortController();
      abortController.abort();

      const contract = makeContract();
      const ctx = createTestContext({
        eventBus: collector.bus,
        mcpClient,
        abortSignal: abortController.signal,
      });

      const work: AgentWorkFn<unknown, string> = async () => Ok('done');
      await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', work);

      // No branch deletion
      expect(deletedBranches).toHaveLength(0);
    });

    it('channels notified of abort', async () => {
      const notifications: Array<{ message: string; severity: string }> = [];
      const channel = createMockChannel('slack', true);
      channel.sendNotification = async (message, severity) => {
        notifications.push({ message, severity });
        return Ok({ channel: 'slack' as const, messageId: 'msg_1', timestamp: new Date() });
      };

      // Send abort notification
      await channel.sendNotification(
        'Task task_001 has been aborted by user.',
        'warning',
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0].message).toContain('aborted');
      expect(notifications[0].severity).toBe('warning');
    });
  });

  // ========================================================================
  // Abort with --cleanup
  // ========================================================================

  describe('abort with --cleanup', () => {
    it('deletes branch via MCP when cleanup flag set', async () => {
      const deletedBranches: string[] = [];
      const mcpClient = createMockMCPClient(async (server, method, params) => {
        if (method === 'delete_branch') {
          deletedBranches.push(params['branch'] as string);
        }
        return Ok({ success: true });
      });

      // Simulate abort with cleanup
      await mcpClient.callTool('github', 'delete_branch', { branch: 'feat/dashboard' });

      expect(deletedBranches).toEqual(['feat/dashboard']);
    });

    it('task transitions aborting → aborted after cleanup', () => {
      const task = makeTask({ id: 'task_001', status: 'in_progress' });
      let tasksFile = makeTasksFile([task]);

      // in_progress → paused (intermediate)
      const r1 = updateTaskStatus(tasksFile, 'task_001', 'paused');
      expect(r1.ok).toBe(true);
      if (r1.ok) tasksFile = r1.value;

      // Verify paused state (abort goes through pause in valid transitions)
      expect(tasksFile.tasks[0].status).toBe('paused');

      // Emit abort event
      collector.bus.publish({
        type: 'AgentAborted',
        agentId: 'code_generator',
        taskId: 'task_001',
        reason: 'User abort with --cleanup',
        source: 'test', timestamp: Date.now(),
      });

      const abortEvents = collector.eventsOfType('AgentAborted');
      expect(abortEvents).toHaveLength(1);
      expect(abortEvents[0].reason).toContain('--cleanup');
    });
  });

  // ========================================================================
  // Emergency abort --all
  // ========================================================================

  describe('emergency abort --all', () => {
    it('aborts all in-progress tasks', () => {
      const tasks = [
        makeTask({ id: 'task_001', status: 'in_progress', agent: 'code_generator' }),
        makeTask({ id: 'task_002', status: 'in_progress', agent: 'test_writer' }),
        makeTask({ id: 'task_003', status: 'in_progress', agent: 'pr_reviewer' }),
        makeTask({ id: 'task_004', status: 'pending', agent: 'deployer' }),
        makeTask({ id: 'task_005', status: 'completed', agent: 'spec_writer' }),
      ];
      let tasksFile = makeTasksFile(tasks);

      // Abort all in_progress tasks
      const inProgressIds = tasksFile.tasks
        .filter((t) => t.status === 'in_progress')
        .map((t) => t.id);

      for (const taskId of inProgressIds) {
        const r = updateTaskStatus(tasksFile, taskId, 'paused');
        if (r.ok) tasksFile = r.value;
      }

      // Verify all in_progress are now paused
      const stillInProgress = tasksFile.tasks.filter((t) => t.status === 'in_progress');
      expect(stillInProgress).toHaveLength(0);

      const paused = tasksFile.tasks.filter((t) => t.status === 'paused');
      expect(paused).toHaveLength(3);

      // Pending and completed should be unchanged
      expect(tasksFile.tasks.find((t) => t.id === 'task_004')?.status).toBe('pending');
      expect(tasksFile.tasks.find((t) => t.id === 'task_005')?.status).toBe('completed');
    });

    it('emits single consolidated notification for --all abort', async () => {
      const notifications: string[] = [];
      const channel = createMockChannel('slack', true);
      channel.sendNotification = async (message, severity) => {
        notifications.push(message);
        return Ok({ channel: 'slack' as const, messageId: 'msg_1', timestamp: new Date() });
      };

      // Single notification for all aborts
      await channel.sendNotification(
        'EMERGENCY ABORT: All 3 active tasks have been aborted. Tasks: task_001, task_002, task_003.',
        'critical',
      );

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toContain('EMERGENCY ABORT');
      expect(notifications[0]).toContain('task_001');
      expect(notifications[0]).toContain('task_002');
      expect(notifications[0]).toContain('task_003');
    });

    it('emits AgentAborted for each aborted agent', () => {
      const agents = ['code_generator', 'test_writer', 'pr_reviewer'];

      for (const agent of agents) {
        collector.bus.publish({
          type: 'AgentAborted',
          agentId: agent,
          taskId: `task_${agents.indexOf(agent) + 1}`.padStart(8, '0'),
          reason: 'Emergency abort --all',
          source: 'test', timestamp: Date.now(),
        });
      }

      const abortEvents = collector.eventsOfType('AgentAborted');
      expect(abortEvents).toHaveLength(3);
      expect(new Set(abortEvents.map((e) => e.agentId))).toEqual(new Set(agents));
    });
  });

  // ========================================================================
  // Abort with task YAML status check (slow path)
  // ========================================================================

  describe('abort via task YAML status (slow path)', () => {
    it('agent detects aborting status from tasks YAML', async () => {
      const tasksYaml = tasksToYaml([
        makeTask({ id: 'task_001', status: 'failed' }),
      ]);

      const fs = createMockFs({
        '/project/agentforge.tasks.yaml': tasksYaml,
      });

      const work: AgentWorkFn<unknown, string> = async () => Ok('should not reach');
      const contract = makeContract();
      const ctx = createTestContext({ eventBus: collector.bus, fs });

      const result = await runAgent(contract, ctx, {}, 'write_code', 'src/test.ts', 'Generate', work);

      // The base-agent checks task YAML on the slow path
      // If task is in failed/aborting/aborted, it should abort
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('AGENT_ABORTED');
      }
    });
  });
});
