/**
 * P20 Slack Integration Full Workflow Tests
 *
 * Validates the complete Slack interactive workflow per PRD v2.0:
 * - HITLChannel and RichHITLChannel interface compliance
 * - Live task board post + in-place update
 * - Approval request Block Kit structure
 * - Request Changes flow with thread reply capture
 * - First-response-wins routing via ChannelRouter
 * - channel_source audit attribution
 */

import type {
  ApprovalContext,
  ChannelMessageRef,
  HITLDecision,
  PhaseSummary,
  RichHITLChannel,
  TaskSummary,
} from '@agentforge/core';
import type { SlackActionHandler, SlackApp, SlackMessageHandler } from './slack-channel.js';
import { createSlackChannel } from './slack-channel.js';
import { createChannelRouter } from '../router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockSlackApp {
  app: SlackApp;
  postMessageCalls: Array<{
    channel: string;
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
  }>;
  updateCalls: Array<{
    channel: string;
    ts: string;
    text: string;
    blocks?: unknown[];
  }>;
  actionHandlers: Map<string, SlackActionHandler>;
  messageHandlers: Array<{ pattern: RegExp | string; handler: SlackMessageHandler }>;
  simulateAction(actionId: string, value?: string): Promise<void>;
  simulateMessage(text: string, threadTs?: string): Promise<void>;
}

function createMockSlackApp(): MockSlackApp {
  const postMessageCalls: MockSlackApp['postMessageCalls'] = [];
  const updateCalls: MockSlackApp['updateCalls'] = [];
  const actionHandlers = new Map<string, SlackActionHandler>();
  const messageHandlers: Array<{ pattern: RegExp | string; handler: SlackMessageHandler }> = [];

  let messageCounter = 0;

  const app: SlackApp = {
    client: {
      chat: {
        postMessage: async (args) => {
          postMessageCalls.push(args);
          messageCounter += 1;
          return { ok: true, ts: `ts-${messageCounter}`, channel: args.channel };
        },
        update: async (args) => {
          updateCalls.push(args);
          return { ok: true };
        },
      },
    },
    action: (actionId, handler) => {
      const key = actionId instanceof RegExp ? actionId.source : actionId;
      actionHandlers.set(key, handler);
    },
    message: (pattern, handler) => {
      messageHandlers.push({ pattern, handler });
    },
    start: async () => {
      /* noop */
    },
    stop: async () => {
      /* noop */
    },
  };

  return {
    app,
    postMessageCalls,
    updateCalls,
    actionHandlers,
    messageHandlers,

    async simulateAction(actionId: string, value?: string) {
      for (const [, handler] of actionHandlers) {
        await handler({
          action: { action_id: actionId, value },
          message: { ts: 'msg-ts', thread_ts: undefined },
          channel: { id: 'C123' },
        });
      }
    },

    async simulateMessage(text: string, threadTs?: string) {
      for (const { handler } of messageHandlers) {
        await handler({ text, thread_ts: threadTs, channel: 'C123' });
      }
    },
  };
}

const CHANNEL_ID = 'C-SLACK-P20';

function makeTask(overrides?: Partial<TaskSummary>): TaskSummary {
  return {
    id: 'task-p20',
    name: 'Implement login',
    status: 'awaiting_approval',
    costUsd: 1.23,
    assignedAgent: 'coder-agent',
    ...overrides,
  };
}

function makeApprovalContext(overrides?: Partial<ApprovalContext>): ApprovalContext {
  return {
    title: 'Review login feature',
    description: 'Implements OAuth login flow.',
    changes: { files: 5, additions: 200, deletions: 30 },
    prUrl: 'https://github.com/org/repo/pull/99',
    ...overrides,
  };
}

function makePhaseSummary(overrides?: Partial<PhaseSummary>): PhaseSummary {
  return {
    phase: 'development',
    projectName: 'MyApp',
    totalTasks: 4,
    costSoFar: 2.5,
    budgetLimit: 20.0,
    elapsedMinutes: 15,
    ...overrides,
  };
}

function makeRef(messageId = 'ts-1'): ChannelMessageRef {
  return { channel: 'slack', messageId, timestamp: new Date() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P20 Slack Integration Full Workflow', () => {
  // =========================================================================
  // 1. HITLChannel interface implemented
  // =========================================================================
  describe('HITLChannel interface compliance', () => {
    it('implements sendNotification', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.sendNotification('Build passed', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('slack');
        expect(result.value.messageId).toBeDefined();
      }
    });

    it('implements requestApproval', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.requestApproval(makeTask(), makeApprovalContext());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('slack');
      }
    });

    it('implements onDecision', () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      expect(() => {
        channel.onDecision(() => {
          /* noop */
        });
      }).not.toThrow();
    });

    it('implements updateStatus', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.updateStatus(makeRef(), 'completed');

      expect(result.ok).toBe(true);
      expect(mock.updateCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // 2. RichHITLChannel interface implemented
  // =========================================================================
  describe('RichHITLChannel interface compliance', () => {
    it('implements sendTaskBoard', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.sendTaskBoard([makeTask()], makePhaseSummary());

      expect(result.ok).toBe(true);
    });

    it('implements sendCodePreview', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.sendCodePreview(
        'function login() {}',
        'typescript',
        'Login handler',
      );

      expect(result.ok).toBe(true);
    });

    it('implements startThread (onThreadReply)', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const parentRef = makeRef('ts-parent');
      const result = await channel.startThread(parentRef, 'Follow-up');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.threadId).toBe('ts-parent');
      }
    });

    it('channel capabilities is full for Slack', () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      expect(channel.capabilities).toBe('full');
    });

    it('channel type is slack', () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      // Confirms the type satisfies RichHITLChannel
      const rich: RichHITLChannel = channel;
      expect(rich.type).toBe('slack');
    });
  });

  // =========================================================================
  // 3. Live task board: post pinned summary, update in place
  // =========================================================================
  describe('Live task board', () => {
    it('posts a task board when phase starts', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const tasks = [
        makeTask({ id: 't1', name: 'Design API', status: 'in_progress' }),
        makeTask({ id: 't2', name: 'Write tests', status: 'pending' }),
      ];
      const summary = makePhaseSummary({ phase: 'development', totalTasks: 2 });

      const result = await channel.sendTaskBoard(tasks, summary);

      expect(result.ok).toBe(true);
      expect(mock.postMessageCalls).toHaveLength(1);
      expect(mock.postMessageCalls[0].text).toContain('Task Board');
      expect(mock.postMessageCalls[0].blocks).toBeDefined();

      // Verify header block contains project + phase
      const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
      const header = blocks.find((b) => b.type === 'header') as {
        text: { text: string };
      } | undefined;
      expect(header).toBeDefined();
      expect(header?.text.text).toContain('MyApp');
      expect(header?.text.text).toContain('development');
    });

    it('updates task board in place via chat.update when task status changes', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      // Phase starts - post initial board
      const tasksV1 = [
        makeTask({ id: 't1', name: 'Design API', status: 'in_progress' }),
        makeTask({ id: 't2', name: 'Write tests', status: 'pending' }),
      ];
      const summary = makePhaseSummary();
      const postResult = await channel.sendTaskBoard(tasksV1, summary);
      expect(postResult.ok).toBe(true);

      const boardRef = postResult.ok ? postResult.value : makeRef();

      // Task status changes - update board in place
      const tasksV2 = [
        makeTask({ id: 't1', name: 'Design API', status: 'completed' }),
        makeTask({ id: 't2', name: 'Write tests', status: 'in_progress' }),
      ];
      const updateResult = await channel.updateTaskBoard(boardRef, tasksV2, summary);
      expect(updateResult.ok).toBe(true);

      // Verify chat.update was called (not a new postMessage)
      expect(mock.updateCalls).toHaveLength(1);
      expect(mock.updateCalls[0].ts).toBe(boardRef.messageId);
      expect(mock.updateCalls[0].blocks).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Approval requests with Block Kit buttons
  // =========================================================================
  describe('Approval requests with Block Kit', () => {
    it('sends approval with Approve, Request Changes, and Reject buttons', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const task = makeTask({ id: 'task-abc' });
      await channel.requestApproval(task, makeApprovalContext());

      const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
      const actionsBlock = blocks.find((b) => b.type === 'actions') as {
        elements: Array<{ action_id: string; type: string; style?: string }>;
      } | undefined;

      expect(actionsBlock).toBeDefined();
      const actionIds = actionsBlock?.elements.map((e) => e.action_id) ?? [];

      expect(actionIds).toContain('approve_task-abc');
      expect(actionIds).toContain('changes_requested_task-abc');
      expect(actionIds).toContain('rejected_task-abc');
    });

    it('approval buttons are Block Kit button type', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      await channel.requestApproval(makeTask(), makeApprovalContext());

      const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
      const actionsBlock = blocks.find((b) => b.type === 'actions') as {
        elements: Array<{ type: string }>;
      } | undefined;

      expect(actionsBlock).toBeDefined();
      for (const el of actionsBlock?.elements ?? []) {
        expect(el.type).toBe('button');
      }
    });

    it('approval card includes task fields (name, status, agent, cost)', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const task = makeTask({
        id: 'task-fields',
        name: 'Deploy service',
        status: 'awaiting_approval',
        assignedAgent: 'deploy-bot',
        costUsd: 3.14,
      });
      await channel.requestApproval(task, makeApprovalContext());

      const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
      const fieldsBlock = blocks.find(
        (b) => b.type === 'section' && Array.isArray((b as { fields?: unknown[] }).fields),
      ) as { fields: Array<{ text: string }> } | undefined;

      expect(fieldsBlock).toBeDefined();
      const fieldTexts = fieldsBlock?.fields.map((f) => f.text).join(' ') ?? '';
      expect(fieldTexts).toContain('Deploy service');
      expect(fieldTexts).toContain('deploy-bot');
      expect(fieldTexts).toContain('3.14');
    });

    it('approval card includes PR link when provided', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      await channel.requestApproval(
        makeTask(),
        makeApprovalContext({ prUrl: 'https://github.com/org/repo/pull/123' }),
      );

      const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
      const blockTexts = JSON.stringify(blocks);
      expect(blockTexts).toContain('https://github.com/org/repo/pull/123');
    });
  });

  // =========================================================================
  // 5. Request Changes flow: thread reply becomes revision instructions
  // =========================================================================
  describe('Request Changes flow with thread reply', () => {
    it('clicking Request Changes triggers decision callback with changes_requested', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];
      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      await mock.simulateAction('changes_requested_task-rc1', 'task-rc1');

      expect(decisions).toHaveLength(1);
      expect(decisions[0].taskId).toBe('task-rc1');
      expect(decisions[0].decision).toBe('changes_requested');
    });

    it('developer thread reply captured as revision instructions via onThreadReply', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      // 1. Post approval request
      const postResult = await channel.requestApproval(
        makeTask({ id: 'task-rev' }),
        makeApprovalContext(),
      );
      expect(postResult.ok).toBe(true);
      const approvalRef = postResult.ok ? postResult.value : makeRef();

      // 2. Register thread reply listener on the approval message
      const revisionInstructions: string[] = [];
      channel.onThreadReply(approvalRef, (text) => {
        revisionInstructions.push(text);
      });

      // 3. Simulate a thread reply from the developer
      await mock.simulateMessage(
        'Please add input validation for email field',
        approvalRef.messageId,
      );

      expect(revisionInstructions).toHaveLength(1);
      expect(revisionInstructions[0]).toBe('Please add input validation for email field');
    });

    it('multiple thread replies are all captured', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const parentRef = makeRef('ts-multi-reply');
      const replies: string[] = [];
      channel.onThreadReply(parentRef, (text) => {
        replies.push(text);
      });

      await mock.simulateMessage('Fix the header', 'ts-multi-reply');
      await mock.simulateMessage('Also update the footer', 'ts-multi-reply');

      expect(replies).toHaveLength(2);
      expect(replies[0]).toBe('Fix the header');
      expect(replies[1]).toBe('Also update the footer');
    });
  });

  // =========================================================================
  // 6. Approval routing: first-response-wins via ChannelRouter
  // =========================================================================
  describe('First-response-wins approval routing', () => {
    it('Slack approval triggers decision callback with correct decision', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const decisions: Array<{ taskId: string; decision: HITLDecision; feedback?: string }> = [];
      channel.onDecision((taskId, decision, feedback) => {
        decisions.push({ taskId, decision, feedback });
      });

      await mock.simulateAction('approve_task-win', 'task-win');

      expect(decisions).toHaveLength(1);
      expect(decisions[0].taskId).toBe('task-win');
      expect(decisions[0].decision).toBe('approved');
    });

    it('first response wins: second decision for same task is ignored via router', async () => {
      const mock1 = createMockSlackApp();
      const channel1 = createSlackChannel({
        app: mock1.app,
        channelId: 'C-CHANNEL-1',
        priority: 1,
      });

      const mock2 = createMockSlackApp();
      const channel2 = createSlackChannel({
        app: mock2.app,
        channelId: 'C-CHANNEL-2',
        priority: 2,
      });

      const router = createChannelRouter([channel1, channel2]);

      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];
      router.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      // First channel approves
      await mock1.simulateAction('approve_task-dup', 'task-dup');

      // Second channel also tries to approve same task
      await mock2.simulateAction('approve_task-dup', 'task-dup');

      // Only first decision counts
      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision).toBe('approved');
    });

    it('different tasks can each be decided independently', async () => {
      const mock1 = createMockSlackApp();
      const channel1 = createSlackChannel({
        app: mock1.app,
        channelId: 'C-CH1',
        priority: 1,
      });

      const mock2 = createMockSlackApp();
      const channel2 = createSlackChannel({
        app: mock2.app,
        channelId: 'C-CH2',
        priority: 2,
      });

      const router = createChannelRouter([channel1, channel2]);

      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];
      router.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      await mock1.simulateAction('approve_task-A', 'task-A');
      await mock2.simulateAction('rejected_task-B', 'task-B');

      expect(decisions).toHaveLength(2);
      expect(decisions[0]).toEqual({ taskId: 'task-A', decision: 'approved' });
      expect(decisions[1]).toEqual({ taskId: 'task-B', decision: 'rejected' });
    });
  });

  // =========================================================================
  // 7. Channel source for audit attribution
  // =========================================================================
  describe('channel_source audit attribution', () => {
    it('ChannelMessageRef includes channel=slack for audit trail', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.sendNotification('Audit test', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('slack');
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it('approval ref carries channel=slack for tracing which channel responded', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const result = await channel.requestApproval(makeTask(), makeApprovalContext());

      expect(result.ok).toBe(true);
      if (result.ok) {
        // channel_source is the `channel` field on ChannelMessageRef
        expect(result.value.channel).toBe('slack');
      }
    });

    it('thread ref includes threadId for conversation tracking', async () => {
      const mock = createMockSlackApp();
      const channel = createSlackChannel({ app: mock.app, channelId: CHANNEL_ID });

      const parentRef = makeRef('ts-audit-parent');
      const result = await channel.startThread(parentRef, 'Thread for audit');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('slack');
        expect(result.value.threadId).toBe('ts-audit-parent');
        expect(result.value.messageId).toBeDefined();
      }
    });
  });
});
