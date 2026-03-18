import type { ApprovalContext, ChannelMessageRef, PhaseSummary, TaskSummary } from '@agentforge/core';
import type { SlackActionHandler, SlackApp, SlackMessageHandler } from './slack-channel.js';
import { createSlackChannel } from './slack-channel.js';

/**
 * Create a mock SlackApp that records calls and allows simulating interactions.
 */
function createMockSlackApp() {
  const postMessageCalls: Array<{
    channel: string;
    text: string;
    blocks?: unknown[];
    thread_ts?: string;
  }> = [];

  const updateCalls: Array<{
    channel: string;
    ts: string;
    text: string;
    blocks?: unknown[];
  }> = [];

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

    /** Simulate a button action being pressed. */
    async simulateAction(actionId: string, value?: string) {
      for (const [, handler] of actionHandlers) {
        await handler({
          action: { action_id: actionId, value },
          message: { ts: 'msg-ts', thread_ts: undefined },
          channel: { id: 'C123' },
        });
      }
    },

    /** Simulate a message in a thread. */
    async simulateThreadMessage(text: string, threadTs: string) {
      for (const { handler } of messageHandlers) {
        await handler({ text, thread_ts: threadTs, channel: 'C123' });
      }
    },
  };
}

const TEST_CHANNEL_ID = 'C-TEST-123';

function makeTask(overrides?: Partial<TaskSummary>): TaskSummary {
  return {
    id: 'task-1',
    name: 'Implement feature',
    status: 'awaiting_approval',
    costUsd: 0.42,
    assignedAgent: 'coder-agent',
    ...overrides,
  };
}

function makeApprovalContext(overrides?: Partial<ApprovalContext>): ApprovalContext {
  return {
    title: 'Deploy to prod',
    description: 'Deploying the new feature to production.',
    changes: { files: 3, additions: 100, deletions: 20 },
    prUrl: 'https://github.com/org/repo/pull/42',
    ...overrides,
  };
}

function makePhaseSummary(overrides?: Partial<PhaseSummary>): PhaseSummary {
  return {
    phase: 'development',
    projectName: 'TestProject',
    totalTasks: 5,
    costSoFar: 1.5,
    budgetLimit: 10.0,
    elapsedMinutes: 30,
    ...overrides,
  };
}

function makeRef(messageId = 'ts-1'): ChannelMessageRef {
  return {
    channel: 'slack',
    messageId,
    timestamp: new Date(),
  };
}

describe('createSlackChannel', () => {
  it('sendNotification posts message with correct blocks', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const result = await channel.sendNotification('Server is on fire', 'critical');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.channel).toBe('slack');
      expect(result.value.messageId).toBe('ts-1');
    }
    expect(mock.postMessageCalls).toHaveLength(1);
    expect(mock.postMessageCalls[0].channel).toBe(TEST_CHANNEL_ID);
    expect(mock.postMessageCalls[0].text).toBe('Server is on fire');
    expect(mock.postMessageCalls[0].blocks).toBeDefined();

    const block = mock.postMessageCalls[0].blocks?.[0] as Record<string, unknown>;
    expect(block.type).toBe('section');
  });

  it('requestApproval posts approval card and registers action handlers', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const result = await channel.requestApproval(makeTask(), makeApprovalContext());

    expect(result.ok).toBe(true);
    expect(mock.postMessageCalls).toHaveLength(1);
    expect(mock.postMessageCalls[0].text).toContain('Approval required');

    // Verify blocks contain action buttons
    const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
    const actionsBlock = blocks.find((b) => b.type === 'actions') as
      | { elements: Array<{ action_id: string }> }
      | undefined;
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock?.elements.some((e) => e.action_id === 'approve_task-1')).toBe(true);
    expect(actionsBlock?.elements.some((e) => e.action_id === 'changes_requested_task-1')).toBe(true);
    expect(actionsBlock?.elements.some((e) => e.action_id === 'rejected_task-1')).toBe(true);
  });

  it('onDecision callback fires when button action is received', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const decisions: Array<{ taskId: string; decision: string; feedback?: string }> = [];
    channel.onDecision((taskId, decision, feedback) => {
      decisions.push({ taskId, decision, feedback });
    });

    await mock.simulateAction('approve_task-42', 'task-42');

    expect(decisions).toHaveLength(1);
    expect(decisions[0].taskId).toBe('task-42');
    expect(decisions[0].decision).toBe('approved');
  });

  it('onDecision handles changes_requested action', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const decisions: Array<{ taskId: string; decision: string }> = [];
    channel.onDecision((taskId, decision) => {
      decisions.push({ taskId, decision });
    });

    await mock.simulateAction('changes_requested_task-7');

    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe('changes_requested');
  });

  it('onDecision handles rejected action', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const decisions: Array<{ taskId: string; decision: string }> = [];
    channel.onDecision((taskId, decision) => {
      decisions.push({ taskId, decision });
    });

    await mock.simulateAction('rejected_task-9');

    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe('rejected');
  });

  it('updateStatus calls chat.update', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const ref = makeRef('ts-original');
    const result = await channel.updateStatus(ref, 'completed');

    expect(result.ok).toBe(true);
    expect(mock.updateCalls).toHaveLength(1);
    expect(mock.updateCalls[0].ts).toBe('ts-original');
    expect(mock.updateCalls[0].channel).toBe(TEST_CHANNEL_ID);
  });

  it('sendTaskBoard posts task board message', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const tasks = [makeTask(), makeTask({ id: 'task-2', name: 'Write tests', status: 'completed' })];
    const result = await channel.sendTaskBoard(tasks, makePhaseSummary());

    expect(result.ok).toBe(true);
    expect(mock.postMessageCalls).toHaveLength(1);
    expect(mock.postMessageCalls[0].text).toContain('Task Board');
    expect(mock.postMessageCalls[0].blocks).toBeDefined();
  });

  it('updateTaskBoard updates existing message', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const ref = makeRef('ts-board');
    const result = await channel.updateTaskBoard(
      ref,
      [makeTask({ status: 'completed' })],
      makePhaseSummary(),
    );

    expect(result.ok).toBe(true);
    expect(mock.updateCalls).toHaveLength(1);
    expect(mock.updateCalls[0].ts).toBe('ts-board');
  });

  it('sendCodePreview posts code block', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const result = await channel.sendCodePreview(
      'const x = 42;',
      'typescript',
      'Variable declaration',
    );

    expect(result.ok).toBe(true);
    expect(mock.postMessageCalls).toHaveLength(1);

    const blocks = mock.postMessageCalls[0].blocks as Array<Record<string, unknown>>;
    expect(blocks).toHaveLength(2);
  });

  it('startThread posts in thread', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const parentRef = makeRef('ts-parent');
    const result = await channel.startThread(parentRef, 'Thread message');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.threadId).toBe('ts-parent');
    }
    expect(mock.postMessageCalls).toHaveLength(1);
    expect(mock.postMessageCalls[0].thread_ts).toBe('ts-parent');
  });

  it('onThreadReply fires callback for messages in thread', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const parentRef = makeRef('ts-parent');
    const replies: string[] = [];
    channel.onThreadReply(parentRef, (text) => {
      replies.push(text);
    });

    await mock.simulateThreadMessage('Looks good!', 'ts-parent');

    expect(replies).toHaveLength(1);
    expect(replies[0]).toBe('Looks good!');
  });

  it('isAvailable returns true when client works', async () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const available = await channel.isAvailable();
    expect(available).toBe(true);
  });

  it('isAvailable returns false on error', async () => {
    const mock = createMockSlackApp();
    // Override postMessage to throw
    mock.app.client.chat.postMessage = async () => {
      throw new Error('network error');
    };
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const available = await channel.isAvailable();
    expect(available).toBe(false);
  });

  it('sendNotification returns Err on API failure', async () => {
    const mock = createMockSlackApp();
    mock.app.client.chat.postMessage = async () => {
      throw new Error('API down');
    };
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    const result = await channel.sendNotification('test', 'info');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
    }
  });

  it('has correct type, priority, and capabilities', () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID, priority: 5 });

    expect(channel.type).toBe('slack');
    expect(channel.priority).toBe(5);
    expect(channel.capabilities).toBe('full');
  });

  it('uses default priority of 1', () => {
    const mock = createMockSlackApp();
    const channel = createSlackChannel({ app: mock.app, channelId: TEST_CHANNEL_ID });

    expect(channel.priority).toBe(1);
  });
});
