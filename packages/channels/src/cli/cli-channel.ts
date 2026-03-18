/**
 * @module @agentforge/channels/cli/cli-channel
 *
 * CLI implementation of HITLChannel.
 * Outputs notifications to the terminal and polls the filesystem
 * for approval decision files.
 */

import { Ok } from '@agentforge/core';
import type {
  Result,
  HITLChannel,
  ChannelMessageRef,
  TaskSummary,
  ApprovalContext,
  TaskStatus,
  HITLDecision,
} from '@agentforge/core';
import {
  readFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  formatNotification,
  formatApprovalRequest,
  formatStatusUpdate,
} from './formatting.js';

/**
 * Configuration for the CLI channel.
 */
export interface CliChannelConfig {
  /** Directory to poll for approval files. Default: '.agentforge/approvals' */
  readonly approvalsDir?: string;
  /** Poll interval in ms. Default: 2000 */
  readonly pollIntervalMs?: number;
  /** Priority for channel routing. Default: 10 (lowest) */
  readonly priority?: number;
  /** Output stream, defaults to process.stdout. Useful for testing. */
  readonly output?: { write(s: string): boolean };
}

interface DecisionFileContent {
  readonly decision: HITLDecision;
  readonly feedback?: string;
}

type DecisionCallback = (
  taskId: string,
  decision: HITLDecision,
  feedback?: string,
) => void;

/**
 * CLI channel that implements HITLChannel for terminal-based interaction.
 * Polls the filesystem for approval decision files.
 */
export interface CliChannel extends HITLChannel {
  /** Stop all polling intervals. */
  stopPolling(): void;
}

/**
 * Create a CLI channel for terminal-based human-in-the-loop interaction.
 *
 * Notifications are printed to stdout (or a custom output stream).
 * Approval requests are resolved by polling a directory for JSON decision files.
 *
 * @param config - Optional configuration overrides
 * @returns A CliChannel instance implementing HITLChannel
 */
export function createCliChannel(config: CliChannelConfig = {}): CliChannel {
  const approvalsDir = config.approvalsDir ?? '.agentforge/approvals';
  const pollIntervalMs = config.pollIntervalMs ?? 2000;
  const priority = config.priority ?? 10;
  const output = config.output ?? process.stdout;

  let messageCounter = 0;
  const callbacks: DecisionCallback[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];

  function nextMessageId(): string {
    return `cli-msg-${messageCounter++}`;
  }

  function createRef(messageId?: string): ChannelMessageRef {
    return {
      channel: 'cli',
      messageId: messageId ?? nextMessageId(),
      timestamp: new Date(),
    };
  }

  function writeLine(text: string): void {
    output.write(text + '\n');
  }

  function fireCallbacks(
    taskId: string,
    decision: HITLDecision,
    feedback?: string,
  ): void {
    for (const cb of callbacks) {
      cb(taskId, decision, feedback);
    }
  }

  function pollApprovalsDir(): void {
    try {
      if (!existsSync(approvalsDir)) {
        return;
      }

      const files = readdirSync(approvalsDir).filter((f) =>
        f.endsWith('.json'),
      );

      for (const file of files) {
        const filePath = join(approvalsDir, file);
        try {
          const raw = readFileSync(filePath, 'utf-8');
          const content = JSON.parse(raw) as DecisionFileContent;
          const taskId = file.replace(/\.json$/, '');

          fireCallbacks(taskId, content.decision, content.feedback);
          unlinkSync(filePath);
        } catch {
          // Ignore parse/read errors for individual files
        }
      }
    } catch {
      // Ignore errors — directory may not exist yet
    }
  }

  function startPolling(): void {
    const handle = setInterval(pollApprovalsDir, pollIntervalMs);
    intervals.push(handle);
  }

  const channel: CliChannel = {
    type: 'cli',
    priority,
    capabilities: 'basic',

    async sendNotification(
      message: string,
      severity: 'info' | 'warning' | 'critical',
    ): Promise<Result<ChannelMessageRef>> {
      const formatted = formatNotification(message, severity);
      writeLine(formatted);
      return Ok(createRef());
    },

    async requestApproval(
      task: TaskSummary,
      context: ApprovalContext,
    ): Promise<Result<ChannelMessageRef>> {
      const formatted = formatApprovalRequest(task, context);
      writeLine(formatted);

      // Ensure approvals directory exists
      if (!existsSync(approvalsDir)) {
        mkdirSync(approvalsDir, { recursive: true });
      }

      startPolling();

      return Ok(createRef());
    },

    onDecision(callback: DecisionCallback): void {
      callbacks.push(callback);
    },

    async updateStatus(
      ref: ChannelMessageRef,
      status: TaskStatus,
    ): Promise<Result<void>> {
      const taskId = ref.messageId;
      const formatted = formatStatusUpdate(taskId, status);
      writeLine(formatted);
      return Ok(undefined);
    },

    async isAvailable(): Promise<boolean> {
      return true;
    },

    stopPolling(): void {
      for (const handle of intervals) {
        clearInterval(handle);
      }
      intervals.length = 0;
    },
  };

  return channel;
}
