/**
 * @module @agentforge/channels/slack/blocks
 *
 * Block Kit JSON builders for Slack messages.
 * Each function returns an array of Block Kit block objects.
 */

import type { ApprovalContext, PhaseSummary, TaskStatus, TaskSummary } from '@agentforge/core';

/** Map severity to emoji prefix. */
const SEVERITY_EMOJI: Record<string, string> = {
  info: '\u2139\uFE0F',
  warning: '\u26A0\uFE0F',
  critical: '\uD83D\uDEA8',
};

/** Map task status to emoji. */
const STATUS_EMOJI: Record<TaskStatus, string> = {
  pending: '\u23F3',
  in_progress: '\uD83D\uDD04',
  awaiting_approval: '\u23F3',
  approved: '\u2705',
  changes_requested: '\uD83D\uDD04',
  completed: '\u2705',
  failed: '\u274C',
  paused: '\u23F8\uFE0F',
  aborting: '\u23F9\uFE0F',
  aborted: '\u26D4',
};

/**
 * Build Block Kit blocks for a notification message.
 * @param message - The notification text
 * @param severity - Severity level determining the emoji prefix
 * @returns Block Kit blocks array
 */
export function buildNotificationBlocks(
  message: string,
  severity: 'info' | 'warning' | 'critical',
): unknown[] {
  const emoji = SEVERITY_EMOJI[severity] ?? '';
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${severity.toUpperCase()}*\n${message}`,
      },
    },
  ];
}

/**
 * Build Block Kit blocks for an approval request card.
 * Includes Approve, Request Changes, and Pause action buttons.
 * @param task - The task requiring approval
 * @param context - Additional context for the approval
 * @returns Block Kit blocks array
 */
export function buildApprovalBlocks(
  task: TaskSummary,
  context: ApprovalContext,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Approval Required: ${context.title}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: context.description,
      },
    },
  ];

  const fields: unknown[] = [
    { type: 'mrkdwn', text: `*Task:* ${task.name}` },
    { type: 'mrkdwn', text: `*Status:* ${task.status}` },
  ];

  if (task.assignedAgent) {
    fields.push({ type: 'mrkdwn', text: `*Agent:* ${task.assignedAgent}` });
  }

  if (task.costUsd !== undefined) {
    fields.push({ type: 'mrkdwn', text: `*Cost:* $${task.costUsd.toFixed(2)}` });
  }

  if (context.changes) {
    fields.push({
      type: 'mrkdwn',
      text: `*Changes:* ${context.changes.files} files (+${context.changes.additions}/-${context.changes.deletions})`,
    });
  }

  blocks.push({ type: 'section', fields });

  if (context.prUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*PR:* <${context.prUrl}|View Pull Request>`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Approve', emoji: true },
        style: 'primary',
        action_id: `approve_${task.id}`,
        value: task.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Request Changes', emoji: true },
        action_id: `changes_requested_${task.id}`,
        value: task.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Pause', emoji: true },
        style: 'danger',
        action_id: `rejected_${task.id}`,
        value: task.id,
      },
    ],
  });

  return blocks;
}

/**
 * Build Block Kit blocks for a live task board.
 * Shows all tasks with status emojis plus phase summary and cost.
 * @param tasks - List of tasks to display
 * @param phaseSummary - Current phase summary
 * @returns Block Kit blocks array
 */
export function buildTaskBoardBlocks(
  tasks: readonly TaskSummary[],
  phaseSummary: PhaseSummary,
): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${phaseSummary.projectName} - ${phaseSummary.phase}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Tasks:* ${phaseSummary.totalTasks}` },
        { type: 'mrkdwn', text: `*Cost:* $${phaseSummary.costSoFar.toFixed(2)} / $${phaseSummary.budgetLimit.toFixed(2)}` },
        { type: 'mrkdwn', text: `*Elapsed:* ${phaseSummary.elapsedMinutes} min` },
      ],
    },
    { type: 'divider' },
  ];

  const taskLines = tasks.map((t) => {
    const emoji = STATUS_EMOJI[t.status] ?? '\u2753';
    const cost = t.costUsd !== undefined ? ` ($${t.costUsd.toFixed(2)})` : '';
    const agent = t.assignedAgent ? ` \u2022 ${t.assignedAgent}` : '';
    return `${emoji} *${t.name}* \u2014 ${t.status}${cost}${agent}`;
  });

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: taskLines.join('\n'),
    },
  });

  return blocks;
}

/**
 * Build Block Kit blocks for a code preview.
 * Uses Slack's code block formatting with a description header.
 * @param code - The code to display
 * @param language - Programming language for context
 * @param description - Description of the code
 * @returns Block Kit blocks array
 */
export function buildCodePreviewBlocks(
  code: string,
  language: string,
  description: string,
): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${description}* (\`${language}\`)`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `\`\`\`\n${code}\n\`\`\``,
      },
    },
  ];
}
