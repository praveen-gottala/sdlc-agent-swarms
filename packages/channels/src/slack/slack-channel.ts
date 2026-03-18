/**
 * @module @agentforge/channels/slack/slack-channel
 *
 * Slack implementation of RichHITLChannel.
 * Uses a SlackApp abstraction to remain testable without @slack/bolt.
 */

import { Ok, Err } from '@agentforge/core';
import type {
  AgentForgeError,
  ChannelMessageRef,
  HITLDecision,
  RichHITLChannel,
} from '@agentforge/core';
import {
  buildApprovalBlocks,
  buildCodePreviewBlocks,
  buildNotificationBlocks,
  buildTaskBoardBlocks,
} from './blocks.js';

/**
 * Minimal Slack Web API client interface for chat operations.
 */
export interface SlackClient {
  readonly chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks?: unknown[];
      thread_ts?: string;
    }): Promise<{ ok: boolean; ts?: string; channel?: string }>;
    update(args: {
      channel: string;
      ts: string;
      text: string;
      blocks?: unknown[];
    }): Promise<{ ok: boolean }>;
  };
}

/** Payload delivered to action handlers. */
export interface SlackActionPayload {
  readonly action: { readonly action_id: string; readonly value?: string };
  readonly message?: { readonly ts: string; readonly thread_ts?: string };
  readonly channel?: { readonly id: string };
}

/** Handler signature for Slack actions. */
export type SlackActionHandler = (payload: SlackActionPayload) => Promise<void>;

/** Payload delivered to message handlers. */
export interface SlackMessagePayload {
  readonly text: string;
  readonly thread_ts?: string;
  readonly channel: string;
}

/** Handler signature for Slack messages. */
export type SlackMessageHandler = (payload: SlackMessagePayload) => Promise<void>;

/**
 * Abstraction over a Slack Bolt App.
 * Accepting this interface keeps the implementation testable.
 */
export interface SlackApp {
  readonly client: SlackClient;
  action(actionId: string | RegExp, handler: SlackActionHandler): void;
  message(pattern: RegExp | string, handler: SlackMessageHandler): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Configuration for the Slack channel factory. */
export interface SlackChannelConfig {
  readonly app: SlackApp;
  readonly channelId: string;
  readonly priority?: number;
}

/** The return type of createSlackChannel. */
export type SlackChannel = RichHITLChannel & {
  /** Start the underlying Slack app. */
  start(): Promise<void>;
  /** Stop the underlying Slack app. */
  stop(): Promise<void>;
};

/**
 * Create an AgentForgeError for channel failures.
 */
function channelError(message: string, cause?: unknown): AgentForgeError {
  return {
    code: 'CHANNEL_UNAVAILABLE',
    message,
    cause: cause instanceof Error ? cause : undefined,
    recoverable: true,
  };
}

/**
 * Build a ChannelMessageRef from a Slack API response.
 */
function makeRef(ts: string, threadTs?: string): ChannelMessageRef {
  return {
    channel: 'slack',
    messageId: ts,
    threadId: threadTs,
    timestamp: new Date(),
  };
}

/** Parse an action_id like `approve_<taskId>` into decision + taskId. */
function parseActionId(actionId: string): { decision: HITLDecision; taskId: string } | undefined {
  const approveMatch = /^approve_(.+)$/.exec(actionId);
  if (approveMatch) {
    return { decision: 'approved', taskId: approveMatch[1] };
  }

  const changesMatch = /^changes_requested_(.+)$/.exec(actionId);
  if (changesMatch) {
    return { decision: 'changes_requested', taskId: changesMatch[1] };
  }

  const rejectMatch = /^rejected_(.+)$/.exec(actionId);
  if (rejectMatch) {
    return { decision: 'rejected', taskId: rejectMatch[1] };
  }

  return undefined;
}

/**
 * Create a Slack channel implementing RichHITLChannel.
 *
 * @param config - Slack app instance, channel ID, and optional priority
 * @returns A RichHITLChannel with start/stop lifecycle methods
 */
export function createSlackChannel(config: SlackChannelConfig): SlackChannel {
  const { app, channelId, priority = 1 } = config;

  const decisionCallbacks: Array<
    (taskId: string, decision: HITLDecision, feedback?: string) => void
  > = [];

  const threadCallbacks = new Map<string, Array<(text: string) => void>>();

  // Register a catch-all action handler for approval buttons.
  app.action(/^(approve|changes_requested|rejected)_/, async (payload) => {
    const parsed = parseActionId(payload.action.action_id);
    if (!parsed) return;

    for (const cb of decisionCallbacks) {
      cb(parsed.taskId, parsed.decision, payload.action.value);
    }
  });

  // Register a catch-all message handler for thread replies.
  app.message(/.*/, async (payload) => {
    if (!payload.thread_ts) return;
    const callbacks = threadCallbacks.get(payload.thread_ts);
    if (callbacks) {
      for (const cb of callbacks) {
        cb(payload.text);
      }
    }
  });

  const sendNotification: RichHITLChannel['sendNotification'] = async (message, severity) => {
    try {
      const blocks = buildNotificationBlocks(message, severity);
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: message,
        blocks,
      });
      if (!result.ok || !result.ts) {
        return Err(channelError('Slack postMessage failed'));
      }
      return Ok(makeRef(result.ts));
    } catch (err: unknown) {
      return Err(channelError('Failed to send notification', err));
    }
  };

  const requestApproval: RichHITLChannel['requestApproval'] = async (task, context) => {
    try {
      const blocks = buildApprovalBlocks(task, context);
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: `Approval required: ${context.title}`,
        blocks,
      });
      if (!result.ok || !result.ts) {
        return Err(channelError('Slack postMessage failed for approval'));
      }
      return Ok(makeRef(result.ts));
    } catch (err: unknown) {
      return Err(channelError('Failed to send approval request', err));
    }
  };

  const onDecision: RichHITLChannel['onDecision'] = (callback) => {
    decisionCallbacks.push(callback);
  };

  const updateStatus: RichHITLChannel['updateStatus'] = async (ref, status) => {
    try {
      const result = await app.client.chat.update({
        channel: channelId,
        ts: ref.messageId,
        text: `Status updated: ${status}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Status updated to *${status}*`,
            },
          },
        ],
      });
      if (!result.ok) {
        return Err(channelError('Slack chat.update failed'));
      }
      return Ok(undefined);
    } catch (err: unknown) {
      return Err(channelError('Failed to update status', err));
    }
  };

  const isAvailable: RichHITLChannel['isAvailable'] = async () => {
    try {
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: '',
      });
      // If the API responded at all, we consider it available even if
      // a test message fails. In production, you would use auth.test instead.
      return result.ok;
    } catch {
      return false;
    }
  };

  const sendTaskBoard: RichHITLChannel['sendTaskBoard'] = async (tasks, phaseSummary) => {
    try {
      const blocks = buildTaskBoardBlocks(tasks, phaseSummary);
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: `Task Board: ${phaseSummary.projectName}`,
        blocks,
      });
      if (!result.ok || !result.ts) {
        return Err(channelError('Slack postMessage failed for task board'));
      }
      return Ok(makeRef(result.ts));
    } catch (err: unknown) {
      return Err(channelError('Failed to send task board', err));
    }
  };

  const updateTaskBoard: RichHITLChannel['updateTaskBoard'] = async (ref, tasks, phaseSummary) => {
    try {
      const blocks = buildTaskBoardBlocks(tasks, phaseSummary);
      const result = await app.client.chat.update({
        channel: channelId,
        ts: ref.messageId,
        text: `Task Board: ${phaseSummary.projectName}`,
        blocks,
      });
      if (!result.ok) {
        return Err(channelError('Slack chat.update failed for task board'));
      }
      return Ok(undefined);
    } catch (err: unknown) {
      return Err(channelError('Failed to update task board', err));
    }
  };

  const sendCodePreview: RichHITLChannel['sendCodePreview'] = async (code, language, description) => {
    try {
      const blocks = buildCodePreviewBlocks(code, language, description);
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: `Code: ${description}`,
        blocks,
      });
      if (!result.ok || !result.ts) {
        return Err(channelError('Slack postMessage failed for code preview'));
      }
      return Ok(makeRef(result.ts));
    } catch (err: unknown) {
      return Err(channelError('Failed to send code preview', err));
    }
  };

  const startThread: RichHITLChannel['startThread'] = async (parentRef, message) => {
    try {
      const result = await app.client.chat.postMessage({
        channel: channelId,
        text: message,
        thread_ts: parentRef.messageId,
      });
      if (!result.ok || !result.ts) {
        return Err(channelError('Slack postMessage failed for thread'));
      }
      return Ok(makeRef(result.ts, parentRef.messageId));
    } catch (err: unknown) {
      return Err(channelError('Failed to start thread', err));
    }
  };

  const onThreadReply: RichHITLChannel['onThreadReply'] = (parentRef, callback) => {
    const key = parentRef.messageId;
    const existing = threadCallbacks.get(key);
    if (existing) {
      existing.push(callback);
    } else {
      threadCallbacks.set(key, [callback]);
    }
  };

  return {
    type: 'slack',
    priority,
    capabilities: 'full',
    sendNotification,
    requestApproval,
    onDecision,
    updateStatus,
    isAvailable,
    sendTaskBoard,
    updateTaskBoard,
    sendCodePreview,
    startThread,
    onThreadReply,
    start: () => app.start(),
    stop: () => app.stop(),
  };
}
