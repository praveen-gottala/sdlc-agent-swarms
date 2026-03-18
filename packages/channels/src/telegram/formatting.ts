/**
 * @module @agentforge/channels/telegram/formatting
 *
 * Helper functions for formatting Telegram messages as Markdown.
 * Produces human-readable, emoji-rich messages for notifications,
 * approval requests, and task boards.
 */

import type { TaskStatus, TaskSummary, PhaseSummary, ApprovalContext } from '@agentforge/core';
import type { TelegramInlineKeyboard } from './telegram-client.js';

/**
 * Map a task status to a representative emoji.
 */
export function statusEmoji(status: TaskStatus): string {
  switch (status) {
    case 'pending':
      return '\u23F3'; // hourglass
    case 'in_progress':
      return '\u{1F6E0}\uFE0F'; // hammer_and_wrench
    case 'awaiting_approval':
      return '\u{1F4CB}'; // clipboard
    case 'approved':
      return '\u2705'; // check mark
    case 'changes_requested':
      return '\u{1F504}'; // arrows counterclockwise
    case 'completed':
      return '\u2705'; // check mark
    case 'failed':
      return '\u274C'; // cross mark
    case 'paused':
      return '\u23F8\uFE0F'; // pause button
    default:
      return '\u2753'; // question mark
  }
}

/**
 * Format a notification message with severity-based emoji prefix.
 *
 * @param message - The notification text
 * @param severity - Severity level determining the prefix emoji
 * @returns Markdown-formatted notification string
 */
export function formatNotification(
  message: string,
  severity: 'info' | 'warning' | 'critical',
): string {
  const prefixes: Record<string, string> = {
    info: '\u2139\uFE0F',
    warning: '\u26A0\uFE0F',
    critical: '\u{1F6A8}',
  };
  const prefix = prefixes[severity] ?? '\u2139\uFE0F';
  return `${prefix} *${severity.toUpperCase()}*\n\n${message}`;
}

/**
 * Format an approval request message with task details and context.
 *
 * @param task - The task requiring approval
 * @param context - Additional context about the approval
 * @returns Markdown-formatted approval request string
 */
export function formatApprovalRequest(
  task: TaskSummary,
  context: ApprovalContext,
): string {
  const lines: string[] = [
    `\u{1F4CB} *Approval Required*`,
    '',
    `*Task:* ${task.name}`,
    `*ID:* \`${task.id}\``,
    `*Status:* ${statusEmoji(task.status)} ${task.status}`,
  ];

  if (task.assignedAgent) {
    lines.push(`*Agent:* ${task.assignedAgent}`);
  }

  lines.push('', `*${context.title}*`, context.description);

  if (context.changes) {
    lines.push(
      '',
      `*Changes:* ${context.changes.files} files (+${context.changes.additions} / -${context.changes.deletions})`,
    );
  }

  if (context.cost) {
    lines.push(`*Cost:* $${context.cost.totalCostUsd.toFixed(4)}`);
  }

  if (task.costUsd !== undefined) {
    lines.push(`*Task Cost:* $${task.costUsd.toFixed(4)}`);
  }

  if (context.prUrl) {
    lines.push(`*PR:* ${context.prUrl}`);
  }

  if (context.specRef) {
    lines.push(`*Spec:* ${context.specRef}`);
  }

  return lines.join('\n');
}

/**
 * Format a task board showing all tasks and phase progress.
 *
 * @param tasks - List of tasks to display
 * @param phaseSummary - Summary of the current phase
 * @returns Markdown-formatted task board string
 */
export function formatTaskBoard(
  tasks: readonly TaskSummary[],
  phaseSummary: PhaseSummary,
): string {
  const budgetPct =
    phaseSummary.budgetLimit > 0
      ? ((phaseSummary.costSoFar / phaseSummary.budgetLimit) * 100).toFixed(1)
      : '0.0';

  const lines: string[] = [
    `\u{1F4CA} *${phaseSummary.projectName} \u2014 ${phaseSummary.phase}*`,
    '',
    `\u{1F4B0} Budget: $${phaseSummary.costSoFar.toFixed(2)} / $${phaseSummary.budgetLimit.toFixed(2)} (${budgetPct}%)`,
    `\u23F1 Elapsed: ${phaseSummary.elapsedMinutes} min`,
    `\u{1F4DD} Tasks: ${phaseSummary.totalTasks}`,
    '',
    '*Tasks:*',
  ];

  for (const task of tasks) {
    const emoji = statusEmoji(task.status);
    let line = `${emoji} \`${task.id}\` ${task.name}`;
    if (task.assignedAgent) {
      line += ` \u2014 _${task.assignedAgent}_`;
    }
    if (task.costUsd !== undefined) {
      line += ` ($${task.costUsd.toFixed(4)})`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Build an inline keyboard with approval action buttons for a task.
 *
 * @param taskId - The task ID to encode in callback data
 * @returns A Telegram inline keyboard with Approve, Request Changes, and Reject buttons
 */
export function buildApprovalKeyboard(taskId: string): TelegramInlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: 'Approve \u2705', callback_data: `approve:${taskId}` },
        { text: 'Request Changes \u{1F504}', callback_data: `changes:${taskId}` },
        { text: 'Reject \u274C', callback_data: `reject:${taskId}` },
      ],
    ],
  };
}
