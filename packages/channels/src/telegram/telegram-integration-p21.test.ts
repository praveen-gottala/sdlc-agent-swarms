/**
 * P21 Telegram Integration Tests
 *
 * Validates Telegram channel implementation per PRD v2.0:
 * - HITLChannel core interface fully implemented
 * - Inline keyboard buttons for Approve/Reject
 * - Task board updates with rate limit awareness
 * - Approval decisions emit correct decision types
 * - Capability tier correctly limits functionality
 */

import type {
  TaskSummary,
  PhaseSummary,
  ApprovalContext,
  HITLDecision,
  ChannelMessageRef,
} from '@agentforge/core';
import type {
  TelegramClient,
  TelegramMessage,
  TelegramCallbackQuery,
  TelegramSendOptions,
  TelegramEditOptions,
} from './telegram-client.js';
import { createTelegramChannel } from './telegram-channel.js';

// ─── Mock TelegramClient ───────────────────────────────────────────────

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface MockTelegramClient extends TelegramClient {
  readonly calls: RecordedCall[];
  simulateCallbackQuery(query: TelegramCallbackQuery): void;
  simulateMessage(message: TelegramMessage): void;
}

function createMockTelegramClient(): MockTelegramClient {
  const calls: RecordedCall[] = [];
  const callbackHandlers: Array<(query: TelegramCallbackQuery) => void> = [];
  const messageHandlers: Array<(message: TelegramMessage) => void> = [];
  let messageIdCounter = 1;

  function record(method: string, args: unknown[]): void {
    calls.push({ method, args });
  }

  return {
    calls,

    async sendMessage(
      chatId: string,
      text: string,
      options?: TelegramSendOptions,
    ): Promise<TelegramMessage> {
      record('sendMessage', [chatId, text, options]);
      const msg: TelegramMessage = {
        message_id: messageIdCounter++,
        chat: { id: Number(chatId) },
        text,
        date: Math.floor(Date.now() / 1000),
      };
      return msg;
    },

    async editMessageText(
      chatId: string,
      messageId: number,
      text: string,
      options?: TelegramEditOptions,
    ): Promise<TelegramMessage> {
      record('editMessageText', [chatId, messageId, text, options]);
      return {
        message_id: messageId,
        chat: { id: Number(chatId) },
        text,
        date: Math.floor(Date.now() / 1000),
      };
    },

    async pinChatMessage(chatId: string, messageId: number): Promise<void> {
      record('pinChatMessage', [chatId, messageId]);
    },

    async answerCallbackQuery(
      callbackQueryId: string,
      text?: string,
    ): Promise<void> {
      record('answerCallbackQuery', [callbackQueryId, text]);
    },

    onCallbackQuery(handler: (query: TelegramCallbackQuery) => void): void {
      callbackHandlers.push(handler);
    },

    onMessage(handler: (message: TelegramMessage) => void): void {
      messageHandlers.push(handler);
    },

    async start(): Promise<void> {
      record('start', []);
    },

    async stop(): Promise<void> {
      record('stop', []);
    },

    simulateCallbackQuery(query: TelegramCallbackQuery): void {
      for (const handler of callbackHandlers) {
        handler(query);
      }
    },

    simulateMessage(message: TelegramMessage): void {
      for (const handler of messageHandlers) {
        handler(message);
      }
    },
  };
}

// ─── Test Fixtures ─────────────────────────────────────────────────────

const CHAT_ID = '987654';

const sampleTask: TaskSummary = {
  id: 'task-p21-001',
  name: 'Telegram integration test task',
  status: 'awaiting_approval',
  costUsd: 0.1234,
  assignedAgent: 'test-agent',
};

const sampleContext: ApprovalContext = {
  title: 'Feature implementation review',
  description: 'Telegram channel integration for HITL workflows.',
  changes: { files: 3, additions: 150, deletions: 20 },
  prUrl: 'https://github.com/org/repo/pull/21',
};

const samplePhaseSummary: PhaseSummary = {
  phase: 'Testing',
  projectName: 'AgentForge',
  totalTasks: 8,
  costSoFar: 2.5,
  budgetLimit: 20.0,
  elapsedMinutes: 30,
};

const sampleTasks: readonly TaskSummary[] = [
  { id: 'task-001', name: 'Setup', status: 'completed' },
  { id: 'task-002', name: 'Implementation', status: 'in_progress', assignedAgent: 'coder' },
  { id: 'task-003', name: 'Testing', status: 'pending' },
];

// ─── P21 Tests ──────────────────────────────────────────────────────────

describe('P21 Telegram Integration', () => {
  let mockClient: MockTelegramClient;

  beforeEach(() => {
    mockClient = createMockTelegramClient();
  });

  // ── 1. HITLChannel core interface implemented ──────────────────────

  describe('HITLChannel core interface', () => {
    it('should implement sendNotification', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.sendNotification('Test notification', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('telegram');
        expect(result.value.messageId).toBeDefined();
        expect(result.value.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should implement requestApproval', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.requestApproval(sampleTask, sampleContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('telegram');
        expect(result.value.messageId).toBeDefined();
      }
    });

    it('should implement onDecision', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(typeof channel.onDecision).toBe('function');

      // Verify it accepts a callback without error
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];
      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      // Trigger a decision
      mockClient.simulateCallbackQuery({
        id: 'cbq-interface',
        data: 'approve:task-interface',
        from: { id: 111 },
      });

      expect(decisions).toHaveLength(1);
    });

    it('should implement updateStatus', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const ref: ChannelMessageRef = {
        channel: 'telegram',
        messageId: '100',
        timestamp: new Date(),
      };

      const result = await channel.updateStatus(ref, 'completed');
      expect(result.ok).toBe(true);

      const editCall = mockClient.calls.find((c) => c.method === 'editMessageText');
      expect(editCall).toBeDefined();
      expect((editCall!.args[2] as string)).toContain('completed');
    });

    it('should implement isAvailable', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const available = await channel.isAvailable();
      expect(typeof available).toBe('boolean');
      expect(available).toBe(true);
    });

    it('should satisfy HITLChannel type contract (all methods present)', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      // Verify all HITLChannel methods exist
      expect(typeof channel.sendNotification).toBe('function');
      expect(typeof channel.requestApproval).toBe('function');
      expect(typeof channel.onDecision).toBe('function');
      expect(typeof channel.updateStatus).toBe('function');
      expect(typeof channel.isAvailable).toBe('function');

      // Verify properties
      expect(channel.type).toBeDefined();
      expect(channel.priority).toBeDefined();
      expect(channel.capabilities).toBeDefined();
    });

    it('should return ChannelMessageRef with correct shape from sendNotification', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.sendNotification('shape test', 'warning');

      expect(result.ok).toBe(true);
      if (result.ok) {
        const ref = result.value;
        expect(ref).toHaveProperty('channel');
        expect(ref).toHaveProperty('messageId');
        expect(ref).toHaveProperty('timestamp');
        expect(ref.channel).toBe('telegram');
        expect(typeof ref.messageId).toBe('string');
        expect(ref.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  // ── 2. Inline keyboard buttons ────────────────────────────────────

  describe('Inline keyboard buttons for Approve/Reject', () => {
    it('should include inline keyboard with 3 buttons in approval request', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.requestApproval(sampleTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      expect(call).toBeDefined();
      const options = call!.args[2] as TelegramSendOptions;
      expect(options.reply_markup).toBeDefined();
      expect(options.reply_markup!.inline_keyboard).toHaveLength(1);
      expect(options.reply_markup!.inline_keyboard[0]).toHaveLength(3);
    });

    it('should have callback_data format approve:{taskId}', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.requestApproval(sampleTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const options = call!.args[2] as TelegramSendOptions;
      const buttons = options.reply_markup!.inline_keyboard[0];

      const approveBtn = buttons.find((b) => b.callback_data === `approve:${sampleTask.id}`);
      expect(approveBtn).toBeDefined();
      expect(approveBtn!.text).toContain('Approve');
    });

    it('should have callback_data format changes:{taskId}', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.requestApproval(sampleTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const options = call!.args[2] as TelegramSendOptions;
      const buttons = options.reply_markup!.inline_keyboard[0];

      const changesBtn = buttons.find((b) => b.callback_data === `changes:${sampleTask.id}`);
      expect(changesBtn).toBeDefined();
      expect(changesBtn!.text).toContain('Changes');
    });

    it('should have callback_data format reject:{taskId}', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.requestApproval(sampleTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const options = call!.args[2] as TelegramSendOptions;
      const buttons = options.reply_markup!.inline_keyboard[0];

      const rejectBtn = buttons.find((b) => b.callback_data === `reject:${sampleTask.id}`);
      expect(rejectBtn).toBeDefined();
      expect(rejectBtn!.text).toContain('Reject');
    });

    it('should encode dynamic task IDs in callback data', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const customTask: TaskSummary = {
        id: 'custom-task-xyz-789',
        name: 'Custom task',
        status: 'awaiting_approval',
      };
      await channel.requestApproval(customTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const options = call!.args[2] as TelegramSendOptions;
      const buttons = options.reply_markup!.inline_keyboard[0];
      const callbackDatas = buttons.map((b) => b.callback_data);

      expect(callbackDatas).toContain('approve:custom-task-xyz-789');
      expect(callbackDatas).toContain('changes:custom-task-xyz-789');
      expect(callbackDatas).toContain('reject:custom-task-xyz-789');
    });
  });

  // ── 3. Task board updates with rate limit awareness ────────────────

  describe('Task board updates with rate limit awareness', () => {
    it('should send task board via sendMessage with Markdown', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      expect(result.ok).toBe(true);
      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      expect(call).toBeDefined();
      const options = call!.args[2] as TelegramSendOptions;
      expect(options.parse_mode).toBe('Markdown');
    });

    it('should skip updateTaskBoard when called within 3 seconds (TASK_BOARD_RATE_LIMIT_MS)', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      // Send initial task board (sets lastTaskBoardUpdate)
      await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      const ref: ChannelMessageRef = {
        channel: 'telegram',
        messageId: '1',
        timestamp: new Date(),
      };

      // Immediately try to update (within 3s window)
      const result = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);

      // editMessageText should NOT have been called due to rate limiting
      const editCalls = mockClient.calls.filter((c) => c.method === 'editMessageText');
      expect(editCalls).toHaveLength(0);
    });

    it('should allow updateTaskBoard after rate limit window expires', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      // Send initial task board
      await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      // Wait for rate limit to expire (3100ms > 3000ms)
      await new Promise((resolve) => setTimeout(resolve, 3100));

      const ref: ChannelMessageRef = {
        channel: 'telegram',
        messageId: '1',
        timestamp: new Date(),
      };

      const result = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);

      // editMessageText SHOULD have been called
      const editCalls = mockClient.calls.filter((c) => c.method === 'editMessageText');
      expect(editCalls).toHaveLength(1);
    }, 10000);

    it('should use editMessageText for task board updates', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      // No prior sendTaskBoard so lastTaskBoardUpdate is 0 - update should go through
      const ref: ChannelMessageRef = {
        channel: 'telegram',
        messageId: '55',
        timestamp: new Date(),
      };

      await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);

      const editCall = mockClient.calls.find((c) => c.method === 'editMessageText');
      expect(editCall).toBeDefined();
      expect(editCall!.args[0]).toBe(CHAT_ID);
      expect(editCall!.args[1]).toBe(55);
    });

    it('should return Ok even when rate-limited (silently skips)', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      const ref: ChannelMessageRef = {
        channel: 'telegram',
        messageId: '1',
        timestamp: new Date(),
      };

      // Multiple rapid updates
      const r1 = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      const r2 = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      const r3 = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);

      expect(r1.ok).toBe(true);
      expect(r2.ok).toBe(true);
      expect(r3.ok).toBe(true);

      // None should have resulted in an editMessageText call
      const editCalls = mockClient.calls.filter((c) => c.method === 'editMessageText');
      expect(editCalls).toHaveLength(0);
    });

    it('should pin the task board message on initial send', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      const pinCall = mockClient.calls.find((c) => c.method === 'pinChatMessage');
      expect(pinCall).toBeDefined();
    });
  });

  // ── 4. Approval decisions emit correct decision types ──────────────

  describe('Approval decisions from Telegram', () => {
    it('should emit approved decision for approve callback', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-approve',
        data: 'approve:task-p21-001',
        from: { id: 42 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].taskId).toBe('task-p21-001');
      expect(decisions[0].decision).toBe('approved');
    });

    it('should emit changes_requested decision for changes callback', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-changes',
        data: 'changes:task-p21-002',
        from: { id: 42 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].taskId).toBe('task-p21-002');
      expect(decisions[0].decision).toBe('changes_requested');
    });

    it('should emit rejected decision for reject callback', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-reject',
        data: 'reject:task-p21-003',
        from: { id: 42 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].taskId).toBe('task-p21-003');
      expect(decisions[0].decision).toBe('rejected');
    });

    it('should acknowledge callback query via answerCallbackQuery', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      channel.onDecision(() => {});

      mockClient.simulateCallbackQuery({
        id: 'cbq-ack-test',
        data: 'approve:task-p21-ack',
        from: { id: 42 },
      });

      const ackCall = mockClient.calls.find((c) => c.method === 'answerCallbackQuery');
      expect(ackCall).toBeDefined();
      expect(ackCall!.args[0]).toBe('cbq-ack-test');
    });

    it('should not emit decision for unknown callback action', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-unknown',
        data: 'escalate:task-p21-004',
        from: { id: 42 },
      });

      expect(decisions).toHaveLength(0);
    });

    it('should not emit decision for callback query without data', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-nodata',
        from: { id: 42 },
      });

      expect(decisions).toHaveLength(0);
    });

    it('should support multiple decision callbacks', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions1: Array<{ taskId: string; decision: HITLDecision }> = [];
      const decisions2: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions1.push({ taskId, decision });
      });
      channel.onDecision((taskId, decision) => {
        decisions2.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-multi',
        data: 'reject:task-multi',
        from: { id: 42 },
      });

      expect(decisions1).toHaveLength(1);
      expect(decisions2).toHaveLength(1);
      expect(decisions1[0].decision).toBe('rejected');
      expect(decisions2[0].decision).toBe('rejected');
    });
  });

  // ── 5. Capability tier ─────────────────────────────────────────────

  describe('Capability tier', () => {
    it('should have type = telegram', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.type).toBe('telegram');
    });

    it('should have default priority = 10', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.priority).toBe(10);
    });

    it('should have capabilities = approvals (not full)', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.capabilities).toBe('approvals');
      expect(channel.capabilities).not.toBe('full');
    });

    it('should allow custom priority override', () => {
      const channel = createTelegramChannel({
        client: mockClient,
        chatId: CHAT_ID,
        priority: 20,
      });
      expect(channel.priority).toBe(20);
    });

    it('should support sendTaskBoard (partial RichHITLChannel)', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(typeof channel.sendTaskBoard).toBe('function');

      const result = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);
    });

    it('should support updateTaskBoard (partial RichHITLChannel)', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(typeof channel.updateTaskBoard).toBe('function');
    });

    it('should handle error results with CHANNEL_UNAVAILABLE code', async () => {
      const failingClient = createMockTelegramClient();
      failingClient.sendMessage = async () => {
        throw new Error('Bot token invalid');
      };
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });

      const result = await channel.sendNotification('test', 'critical');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
        expect(result.error.recoverable).toBe(true);
        expect(result.error.message).toContain('Bot token invalid');
      }
    });

    it('should delegate start/stop lifecycle to client', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      await channel.start();
      expect(mockClient.calls.some((c) => c.method === 'start')).toBe(true);

      await channel.stop();
      expect(mockClient.calls.some((c) => c.method === 'stop')).toBe(true);
    });
  });
});
