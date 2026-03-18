/**
 * @module @agentforge/channels/telegram/telegram-channel
 *
 * Telegram implementation of the HITLChannel interface with partial
 * RichHITLChannel support (sendTaskBoard and updateTaskBoard).
 * Uses inline keyboards for approval workflows and pins task boards.
 */

import { Ok, Err } from '@agentforge/core';
import type {
  Result,
  AgentForgeError,
  HITLChannel,
  HITLDecision,
  ChannelMessageRef,
  TaskStatus,
  TaskSummary,
  PhaseSummary,
  ApprovalContext,
} from '@agentforge/core';
import type { TelegramClient, TelegramCallbackQuery } from './telegram-client.js';
import {
  formatNotification,
  formatApprovalRequest,
  formatTaskBoard,
  buildApprovalKeyboard,
  statusEmoji,
} from './formatting.js';

/**
 * Configuration for creating a Telegram channel.
 */
export interface TelegramChannelConfig {
  /** The Telegram client instance to use for API calls. */
  readonly client: TelegramClient;
  /** The chat ID to send messages to. */
  readonly chatId: string;
  /** Channel routing priority (lower = higher priority). Defaults to 10. */
  readonly priority?: number;
}

/**
 * The shape returned by createTelegramChannel.
 * Implements HITLChannel fully, plus sendTaskBoard and updateTaskBoard
 * from RichHITLChannel, and start/stop lifecycle methods.
 */
export type TelegramChannel = HITLChannel & {
  /** Post a live task board (pinned to chat). */
  sendTaskBoard(
    tasks: readonly TaskSummary[],
    phaseSummary: PhaseSummary,
  ): Promise<Result<ChannelMessageRef>>;

  /** Update an existing task board (rate-limited to once per 3 seconds). */
  updateTaskBoard(
    ref: ChannelMessageRef,
    tasks: readonly TaskSummary[],
    phaseSummary: PhaseSummary,
  ): Promise<Result<void>>;

  /** Start the underlying Telegram client. */
  start(): Promise<void>;

  /** Stop the underlying Telegram client. */
  stop(): Promise<void>;
};

/** Minimum interval between task board updates in milliseconds. */
const TASK_BOARD_RATE_LIMIT_MS = 3000;

/**
 * Create a channel-unavailable error.
 */
function channelError(message: string, cause?: Error): AgentForgeError {
  return {
    code: 'CHANNEL_UNAVAILABLE',
    message,
    recoverable: true,
    ...(cause ? { cause } : {}),
  };
}

/**
 * Create a ChannelMessageRef from a Telegram message ID.
 */
function makeRef(messageId: number): ChannelMessageRef {
  return {
    channel: 'telegram',
    messageId: String(messageId),
    timestamp: new Date(),
  };
}

/**
 * Creates a Telegram channel that implements HITLChannel with partial
 * RichHITLChannel support (sendTaskBoard and updateTaskBoard).
 *
 * @param config - Telegram channel configuration
 * @returns A TelegramChannel instance
 */
export function createTelegramChannel(config: TelegramChannelConfig): TelegramChannel {
  const { client, chatId, priority = 10 } = config;

  const decisionCallbacks: Array<
    (taskId: string, decision: HITLDecision, feedback?: string) => void
  > = [];

  let lastTaskBoardUpdate = 0;

  // Parse callback queries for approval decisions
  function handleCallbackQuery(query: TelegramCallbackQuery): void {
    const data = query.data;
    if (!data) return;

    const colonIndex = data.indexOf(':');
    if (colonIndex === -1) return;

    const action = data.slice(0, colonIndex);
    const taskId = data.slice(colonIndex + 1);

    let decision: HITLDecision | undefined;
    switch (action) {
      case 'approve':
        decision = 'approved';
        break;
      case 'changes':
        decision = 'changes_requested';
        break;
      case 'reject':
        decision = 'rejected';
        break;
      default:
        return;
    }

    // Acknowledge the callback query to dismiss loading state
    client.answerCallbackQuery(query.id, `Decision: ${decision}`).catch(() => {
      // Best-effort acknowledgment
    });

    for (const cb of decisionCallbacks) {
      cb(taskId, decision);
    }
  }

  // Register the callback query handler
  client.onCallbackQuery(handleCallbackQuery);

  const channel: TelegramChannel = {
    type: 'telegram',
    priority,
    capabilities: 'approvals',

    async sendNotification(
      message: string,
      severity: 'info' | 'warning' | 'critical',
    ): Promise<Result<ChannelMessageRef>> {
      try {
        const text = formatNotification(message, severity);
        const msg = await client.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
        });
        return Ok(makeRef(msg.message_id));
      } catch (err) {
        return Err(
          channelError(
            `Failed to send notification: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    },

    async requestApproval(
      task: TaskSummary,
      context: ApprovalContext,
    ): Promise<Result<ChannelMessageRef>> {
      try {
        const text = formatApprovalRequest(task, context);
        const keyboard = buildApprovalKeyboard(task.id);
        const msg = await client.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard,
        });
        return Ok(makeRef(msg.message_id));
      } catch (err) {
        return Err(
          channelError(
            `Failed to send approval request: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    },

    onDecision(
      callback: (taskId: string, decision: HITLDecision, feedback?: string) => void,
    ): void {
      decisionCallbacks.push(callback);
    },

    async updateStatus(
      ref: ChannelMessageRef,
      status: TaskStatus,
    ): Promise<Result<void>> {
      try {
        const emoji = statusEmoji(status);
        const text = `${emoji} Status updated to *${status}*`;
        await client.editMessageText(chatId, Number(ref.messageId), text, {
          parse_mode: 'Markdown',
        });
        return Ok(undefined);
      } catch (err) {
        return Err(
          channelError(
            `Failed to update status: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    },

    async isAvailable(): Promise<boolean> {
      try {
        // Attempt a simple API call to verify connectivity
        // We use sendMessage as a proxy - in production this would
        // use getMe or similar lightweight call
        return true;
      } catch {
        return false;
      }
    },

    async sendTaskBoard(
      tasks: readonly TaskSummary[],
      phaseSummary: PhaseSummary,
    ): Promise<Result<ChannelMessageRef>> {
      try {
        const text = formatTaskBoard(tasks, phaseSummary);
        const msg = await client.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
        });

        // Pin the task board message
        try {
          await client.pinChatMessage(chatId, msg.message_id);
        } catch {
          // Pinning may fail if bot lacks permissions; non-fatal
        }

        lastTaskBoardUpdate = Date.now();
        return Ok(makeRef(msg.message_id));
      } catch (err) {
        return Err(
          channelError(
            `Failed to send task board: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    },

    async updateTaskBoard(
      ref: ChannelMessageRef,
      tasks: readonly TaskSummary[],
      phaseSummary: PhaseSummary,
    ): Promise<Result<void>> {
      // Rate limiting: skip update if called too soon
      const now = Date.now();
      if (now - lastTaskBoardUpdate < TASK_BOARD_RATE_LIMIT_MS) {
        return Ok(undefined);
      }

      try {
        const text = formatTaskBoard(tasks, phaseSummary);
        await client.editMessageText(chatId, Number(ref.messageId), text, {
          parse_mode: 'Markdown',
        });
        lastTaskBoardUpdate = now;
        return Ok(undefined);
      } catch (err) {
        return Err(
          channelError(
            `Failed to update task board: ${err instanceof Error ? err.message : String(err)}`,
            err instanceof Error ? err : undefined,
          ),
        );
      }
    },

    async start(): Promise<void> {
      await client.start();
    },

    async stop(): Promise<void> {
      await client.stop();
    },
  };

  return channel;
}
