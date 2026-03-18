import { Ok, Err } from '@agentforge/core';
import type {
  HITLChannel,
  HITLDecision,
  ChannelMessageRef,
  TaskSummary,
  ApprovalContext,
  TaskStatus,
  Result,
  AgentForgeError,
} from '@agentforge/core';
import { createChannelRouter, DEFAULT_ROUTING } from './router.js';
import type { RoutingConfig } from './router.js';

function makeRef(channel: 'slack' | 'telegram' | 'cli', id: string): ChannelMessageRef {
  return { channel, messageId: id, timestamp: new Date() };
}

function createMockChannel(
  type: 'slack' | 'telegram' | 'cli',
  priority: number,
  available = true,
): HITLChannel & { decisionCallbacks: ((taskId: string, decision: HITLDecision, feedback?: string) => void)[] } {
  const decisionCallbacks: ((taskId: string, decision: HITLDecision, feedback?: string) => void)[] = [];

  return {
    type,
    priority,
    capabilities: type === 'cli' ? 'basic' : 'full',
    decisionCallbacks,

    sendNotification: jest.fn(async (_message: string, _severity: 'info' | 'warning' | 'critical'): Promise<Result<ChannelMessageRef, AgentForgeError>> => {
      if (!available) {
        return Err({ code: 'CHANNEL_UNAVAILABLE', message: 'Unavailable', recoverable: true });
      }
      return Ok(makeRef(type, `notif-${type}`));
    }),

    requestApproval: jest.fn(async (_task: TaskSummary, _context: ApprovalContext): Promise<Result<ChannelMessageRef, AgentForgeError>> => {
      if (!available) {
        return Err({ code: 'CHANNEL_UNAVAILABLE', message: 'Unavailable', recoverable: true });
      }
      return Ok(makeRef(type, `approval-${type}`));
    }),

    onDecision(callback: (taskId: string, decision: HITLDecision, feedback?: string) => void): void {
      decisionCallbacks.push(callback);
    },

    updateStatus: jest.fn(async (_ref: ChannelMessageRef, _status: TaskStatus): Promise<Result<void, AgentForgeError>> => {
      return Ok(undefined);
    }),

    isAvailable: jest.fn(async (): Promise<boolean> => available),
  };
}

const testTask: TaskSummary = {
  id: 'task_001',
  name: 'Generate Component',
  status: 'awaiting_approval',
};

const testContext: ApprovalContext = {
  title: 'Review Component',
  description: 'Generated a React component',
};

describe('ChannelRouter', () => {
  describe('sendNotification', () => {
    it('sends to primary channel only for info severity', async () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const router = createChannelRouter([telegram, slack]);

      const result = await router.sendNotification('Hello', 'info');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refs).toHaveLength(1);
        expect(result.value.refs[0].channel).toBe('slack'); // lowest priority number = primary
      }
      expect(slack.sendNotification).toHaveBeenCalled();
      expect(telegram.sendNotification).not.toHaveBeenCalled();
    });

    it('sends to all channels for critical severity', async () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const router = createChannelRouter([slack, telegram]);

      const result = await router.sendNotification('Alert!', 'critical');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refs).toHaveLength(2);
      }
      expect(slack.sendNotification).toHaveBeenCalled();
      expect(telegram.sendNotification).toHaveBeenCalled();
    });

    it('returns error when no channels available', async () => {
      const slack = createMockChannel('slack', 1, false);
      const router = createChannelRouter([slack]);

      const result = await router.sendNotification('Hello', 'info');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('CHANNEL_UNAVAILABLE');
      }
    });

    it('collects failures from individual channels', async () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      // Override telegram's sendNotification to return an error
      (telegram.sendNotification as jest.Mock).mockResolvedValue(
        Err({ code: 'CHANNEL_UNAVAILABLE' as const, message: 'API error', recoverable: true }),
      );
      const router = createChannelRouter([slack, telegram]);

      const result = await router.sendNotification('Alert!', 'critical');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refs).toHaveLength(1);
        expect(result.value.failures).toHaveLength(1);
        expect(result.value.failures[0].channel).toBe('telegram');
      }
    });
  });

  describe('requestApproval', () => {
    it('sends to all channels by default', async () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const router = createChannelRouter([slack, telegram]);

      const result = await router.requestApproval(testTask, testContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refs).toHaveLength(2);
      }
    });

    it('sends to primary only when configured', async () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const routingConfig: RoutingConfig = {
        ...DEFAULT_ROUTING,
        approvalRequests: 'primary',
      };
      const router = createChannelRouter([slack, telegram], routingConfig);

      const result = await router.requestApproval(testTask, testContext);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.refs).toHaveLength(1);
        expect(result.value.refs[0].channel).toBe('slack');
      }
    });
  });

  describe('onDecision (first response wins)', () => {
    it('fires callback on first decision', () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const router = createChannelRouter([slack, telegram]);

      const decisions: { taskId: string; decision: HITLDecision }[] = [];
      router.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      // Simulate Slack responding first
      slack.decisionCallbacks[0]('task_001', 'approved');

      expect(decisions).toHaveLength(1);
      expect(decisions[0]).toEqual({ taskId: 'task_001', decision: 'approved' });
    });

    it('ignores duplicate decisions from other channels', () => {
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 2);
      const router = createChannelRouter([slack, telegram]);

      const decisions: { taskId: string; decision: HITLDecision }[] = [];
      router.onDecision((taskId, decision) => {
        decisions.push({ taskId, decision });
      });

      // Slack responds first
      slack.decisionCallbacks[0]('task_001', 'approved');
      // Telegram responds second — should be ignored
      telegram.decisionCallbacks[0]('task_001', 'rejected');

      expect(decisions).toHaveLength(1);
      expect(decisions[0].decision).toBe('approved');
    });

    it('allows decisions for different tasks', () => {
      const slack = createMockChannel('slack', 1);
      const router = createChannelRouter([slack]);

      const decisions: string[] = [];
      router.onDecision((taskId) => {
        decisions.push(taskId);
      });

      slack.decisionCallbacks[0]('task_001', 'approved');
      slack.decisionCallbacks[0]('task_002', 'rejected');

      expect(decisions).toEqual(['task_001', 'task_002']);
    });
  });

  describe('broadcastStatusUpdate', () => {
    it('updates status on the owning channel', async () => {
      const slack = createMockChannel('slack', 1);
      const router = createChannelRouter([slack]);

      const ref = makeRef('slack', 'msg-1');
      const result = await router.broadcastStatusUpdate(ref, 'completed');

      expect(result.ok).toBe(true);
      expect(slack.updateStatus).toHaveBeenCalledWith(ref, 'completed');
    });

    it('returns error if owning channel is unavailable', async () => {
      const slack = createMockChannel('slack', 1, false);
      const router = createChannelRouter([slack]);

      const ref = makeRef('slack', 'msg-1');
      const result = await router.broadcastStatusUpdate(ref, 'completed');

      expect(result.ok).toBe(false);
    });
  });

  describe('channel ordering', () => {
    it('sorts channels by priority', () => {
      const cli = createMockChannel('cli', 10);
      const slack = createMockChannel('slack', 1);
      const telegram = createMockChannel('telegram', 5);

      const router = createChannelRouter([cli, telegram, slack]);

      expect(router.channels[0].type).toBe('slack');
      expect(router.channels[1].type).toBe('telegram');
      expect(router.channels[2].type).toBe('cli');
    });
  });

  describe('reset', () => {
    it('allows re-deciding after reset', () => {
      const slack = createMockChannel('slack', 1);
      const router = createChannelRouter([slack]);

      const decisions: string[] = [];
      router.onDecision((taskId) => {
        decisions.push(taskId);
      });

      slack.decisionCallbacks[0]('task_001', 'approved');
      router.reset();
      slack.decisionCallbacks[0]('task_001', 'rejected');

      expect(decisions).toHaveLength(2);
    });
  });
});
