import type {
  TaskSummary,
  PhaseSummary,
  ApprovalContext,
  HITLDecision,
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
  /** All recorded method calls. */
  readonly calls: RecordedCall[];
  /** Simulate a callback query as if a user pressed an inline button. */
  simulateCallbackQuery(query: TelegramCallbackQuery): void;
  /** Simulate an incoming message. */
  simulateMessage(message: TelegramMessage): void;
}

function createMockClient(): MockTelegramClient {
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

const CHAT_ID = '123456';

const sampleTask: TaskSummary = {
  id: 'task-001',
  name: 'Implement user auth',
  status: 'awaiting_approval',
  costUsd: 0.0523,
  assignedAgent: 'coder-agent',
};

const sampleContext: ApprovalContext = {
  title: 'Auth module implementation',
  description: 'JWT-based authentication with refresh tokens.',
  changes: { files: 5, additions: 200, deletions: 10 },
  prUrl: 'https://github.com/org/repo/pull/42',
};

const samplePhaseSummary: PhaseSummary = {
  phase: 'Implementation',
  projectName: 'MyProject',
  totalTasks: 5,
  costSoFar: 1.25,
  budgetLimit: 10.0,
  elapsedMinutes: 45,
};

const sampleTasks: readonly TaskSummary[] = [
  { id: 'task-001', name: 'Setup project', status: 'completed' },
  { id: 'task-002', name: 'Auth module', status: 'in_progress', assignedAgent: 'coder' },
  { id: 'task-003', name: 'Tests', status: 'pending' },
];

// ─── Tests ─────────────────────────────────────────────────────────────

describe('createTelegramChannel', () => {
  let mockClient: MockTelegramClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  describe('properties', () => {
    it('should have type telegram', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.type).toBe('telegram');
    });

    it('should have default priority 10', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.priority).toBe(10);
    });

    it('should accept custom priority', () => {
      const channel = createTelegramChannel({
        client: mockClient,
        chatId: CHAT_ID,
        priority: 5,
      });
      expect(channel.priority).toBe(5);
    });

    it('should have capabilities set to approvals', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      expect(channel.capabilities).toBe('approvals');
    });
  });

  describe('sendNotification', () => {
    it('should send a Markdown message with severity emoji', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.sendNotification('Deploy complete', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('telegram');
        expect(result.value.messageId).toBeDefined();
      }

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      expect(call).toBeDefined();
      const [sentChatId, sentText, sentOptions] = call!.args as [string, string, TelegramSendOptions];
      expect(sentChatId).toBe(CHAT_ID);
      expect(sentText).toContain('INFO');
      expect(sentText).toContain('Deploy complete');
      expect(sentOptions.parse_mode).toBe('Markdown');
    });

    it('should use warning emoji for warning severity', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.sendNotification('Budget at 80%', 'warning');

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const sentText = call!.args[1] as string;
      expect(sentText).toContain('WARNING');
    });

    it('should use critical emoji for critical severity', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.sendNotification('Budget exceeded', 'critical');

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const sentText = call!.args[1] as string;
      expect(sentText).toContain('CRITICAL');
    });

    it('should return Err when client throws', async () => {
      const failingClient = createMockClient();
      failingClient.sendMessage = async () => {
        throw new Error('Network error');
      };
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });

      const result = await channel.sendNotification('test', 'info');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
        expect(result.error.message).toContain('Network error');
        expect(result.error.recoverable).toBe(true);
      }
    });
  });

  describe('requestApproval', () => {
    it('should send a message with inline keyboard', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.requestApproval(sampleTask, sampleContext);

      expect(result.ok).toBe(true);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      expect(call).toBeDefined();
      const [, sentText, sentOptions] = call!.args as [string, string, TelegramSendOptions];
      expect(sentText).toContain('Approval Required');
      expect(sentText).toContain('Implement user auth');
      expect(sentText).toContain('task-001');
      expect(sentOptions.parse_mode).toBe('Markdown');
      expect(sentOptions.reply_markup).toBeDefined();
      expect(sentOptions.reply_markup!.inline_keyboard).toHaveLength(1);
      expect(sentOptions.reply_markup!.inline_keyboard[0]).toHaveLength(3);
    });

    it('should include approval buttons with correct callback data', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.requestApproval(sampleTask, sampleContext);

      const call = mockClient.calls.find((c) => c.method === 'sendMessage');
      const options = call!.args[2] as TelegramSendOptions;
      const buttons = options.reply_markup!.inline_keyboard[0];

      const callbackDatas = buttons.map((b) => b.callback_data);
      expect(callbackDatas).toContain('approve:task-001');
      expect(callbackDatas).toContain('changes:task-001');
      expect(callbackDatas).toContain('reject:task-001');
    });

    it('should return Err when client throws', async () => {
      const failingClient = createMockClient();
      failingClient.sendMessage = async () => {
        throw new Error('API error');
      };
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });

      const result = await channel.requestApproval(sampleTask, sampleContext);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
      }
    });
  });

  describe('onDecision', () => {
    it('should fire callback when approve callback query is received', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-1',
        data: 'approve:task-001',
        from: { id: 999 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({ taskId: 'task-001', decision: 'approved' });
    });

    it('should fire callback when changes callback query is received', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-2',
        data: 'changes:task-002',
        from: { id: 999 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({
        taskId: 'task-002',
        decision: 'changes_requested',
      });
    });

    it('should fire callback when reject callback query is received', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-3',
        data: 'reject:task-003',
        from: { id: 999 },
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({ taskId: 'task-003', decision: 'rejected' });
    });

    it('should ignore callback queries without data', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-4',
        from: { id: 999 },
      });

      expect(decisions).toHaveLength(0);
    });

    it('should ignore callback queries with unknown action', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const decisions: Array<{ taskId: string; decision: HITLDecision }> = [];

      channel.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      mockClient.simulateCallbackQuery({
        id: 'cbq-5',
        data: 'unknown:task-001',
        from: { id: 999 },
      });

      expect(decisions).toHaveLength(0);
    });

    it('should acknowledge the callback query', () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      channel.onDecision(() => {});

      mockClient.simulateCallbackQuery({
        id: 'cbq-ack',
        data: 'approve:task-001',
        from: { id: 999 },
      });

      const ackCall = mockClient.calls.find(
        (c) => c.method === 'answerCallbackQuery',
      );
      expect(ackCall).toBeDefined();
      expect(ackCall!.args[0]).toBe('cbq-ack');
    });
  });

  describe('updateStatus', () => {
    it('should edit the message with new status', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const ref = {
        channel: 'telegram' as const,
        messageId: '42',
        timestamp: new Date(),
      };

      const result = await channel.updateStatus(ref, 'completed');
      expect(result.ok).toBe(true);

      const call = mockClient.calls.find((c) => c.method === 'editMessageText');
      expect(call).toBeDefined();
      const [editChatId, editMsgId, editText] = call!.args as [string, number, string];
      expect(editChatId).toBe(CHAT_ID);
      expect(editMsgId).toBe(42);
      expect(editText).toContain('completed');
    });

    it('should return Err when edit fails', async () => {
      const failingClient = createMockClient();
      failingClient.editMessageText = async () => {
        throw new Error('Edit failed');
      };
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });
      const ref = {
        channel: 'telegram' as const,
        messageId: '42',
        timestamp: new Date(),
      };

      const result = await channel.updateStatus(ref, 'failed');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
      }
    });
  });

  describe('sendTaskBoard', () => {
    it('should send a formatted task board and pin it', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const result = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.channel).toBe('telegram');
      }

      const sendCall = mockClient.calls.find((c) => c.method === 'sendMessage');
      expect(sendCall).toBeDefined();
      const sentText = sendCall!.args[1] as string;
      expect(sentText).toContain('MyProject');
      expect(sentText).toContain('Implementation');
      expect(sentText).toContain('Setup project');
      expect(sentText).toContain('Auth module');

      const pinCall = mockClient.calls.find((c) => c.method === 'pinChatMessage');
      expect(pinCall).toBeDefined();
    });

    it('should succeed even if pinning fails', async () => {
      const clientWithPinFail = createMockClient();
      clientWithPinFail.pinChatMessage = async () => {
        throw new Error('No permission to pin');
      };
      const channel = createTelegramChannel({
        client: clientWithPinFail,
        chatId: CHAT_ID,
      });

      const result = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);
    });

    it('should return Err when sendMessage fails', async () => {
      const failingClient = createMockClient();
      failingClient.sendMessage = async () => {
        throw new Error('Send failed');
      };
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });

      const result = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(false);
    });
  });

  describe('updateTaskBoard', () => {
    it('should edit the pinned task board message', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });

      // First send a task board to set the lastTaskBoardUpdate timestamp
      const sendResult = await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);
      expect(sendResult.ok).toBe(true);

      // Wait for rate limit to expire
      await new Promise((resolve) => setTimeout(resolve, 3100));

      const ref = {
        channel: 'telegram' as const,
        messageId: '1',
        timestamp: new Date(),
      };

      const updatedTasks: readonly TaskSummary[] = [
        { id: 'task-001', name: 'Setup project', status: 'completed' },
        { id: 'task-002', name: 'Auth module', status: 'completed', assignedAgent: 'coder' },
        { id: 'task-003', name: 'Tests', status: 'in_progress' },
      ];

      const result = await channel.updateTaskBoard(ref, updatedTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);

      const editCall = mockClient.calls.find((c) => c.method === 'editMessageText');
      expect(editCall).toBeDefined();
    });

    it('should throttle rapid updates (rate limiting)', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const ref = {
        channel: 'telegram' as const,
        messageId: '1',
        timestamp: new Date(),
      };

      // First call: send task board (sets lastTaskBoardUpdate)
      await channel.sendTaskBoard(sampleTasks, samplePhaseSummary);

      // Second call: immediate update (should be throttled)
      const result = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(true);

      // editMessageText should NOT have been called (throttled)
      const editCalls = mockClient.calls.filter(
        (c) => c.method === 'editMessageText',
      );
      expect(editCalls).toHaveLength(0);
    });

    it('should return Err when editMessageText fails', async () => {
      const failingClient = createMockClient();
      failingClient.editMessageText = async () => {
        throw new Error('Edit failed');
      };
      // Don't send a task board first to avoid rate limiting
      const channel = createTelegramChannel({ client: failingClient, chatId: CHAT_ID });
      const ref = {
        channel: 'telegram' as const,
        messageId: '1',
        timestamp: new Date(),
      };

      const result = await channel.updateTaskBoard(ref, sampleTasks, samplePhaseSummary);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
      }
    });
  });

  describe('isAvailable', () => {
    it('should return true when client is functional', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      const available = await channel.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('should delegate start to client', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.start();
      expect(mockClient.calls.some((c) => c.method === 'start')).toBe(true);
    });

    it('should delegate stop to client', async () => {
      const channel = createTelegramChannel({ client: mockClient, chatId: CHAT_ID });
      await channel.stop();
      expect(mockClient.calls.some((c) => c.method === 'stop')).toBe(true);
    });
  });
});
