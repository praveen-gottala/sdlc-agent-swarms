/**
 * @module @agentforge/channels/cli/formatting
 *
 * Terminal formatting helpers using raw ANSI escape codes.
 * No external dependencies (no chalk, picocolors, etc.).
 */

import type { TaskStatus, TaskSummary, ApprovalContext } from '@agentforge/core';

const ANSI = {
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  'bold-red': '\x1b[1;31m',
  reset: '\x1b[0m',
} as const;

type AnsiColor = keyof typeof ANSI;

/**
 * Wrap text with ANSI color codes.
 */
export function colorize(text: string, color: AnsiColor): string {
  if (color === 'reset') {
    return `${ANSI.reset}${text}`;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

/**
 * Format a notification message with severity-appropriate coloring.
 */
export function formatNotification(
  message: string,
  severity: 'info' | 'warning' | 'critical',
): string {
  const colorMap: Record<typeof severity, AnsiColor> = {
    info: 'blue',
    warning: 'yellow',
    critical: 'bold-red',
  };
  const label = severity.toUpperCase();
  return colorize(`[${label}] ${message}`, colorMap[severity]);
}

/**
 * Format an approval request for terminal display.
 */
export function formatApprovalRequest(
  task: TaskSummary,
  context: ApprovalContext,
): string {
  const lines: string[] = [
    colorize('━'.repeat(60), 'yellow'),
    colorize('  APPROVAL REQUIRED', 'yellow'),
    colorize('━'.repeat(60), 'yellow'),
    '',
    `  Task:        ${task.id} — ${task.name}`,
    `  Status:      ${task.status}`,
    `  Title:       ${context.title}`,
    `  Description: ${context.description}`,
  ];

  if (task.assignedAgent) {
    lines.push(`  Agent:       ${task.assignedAgent}`);
  }

  if (context.changes) {
    const c = context.changes;
    lines.push(
      `  Changes:     ${c.files} file(s), +${c.additions} -${c.deletions}`,
    );
  }

  if (context.cost) {
    lines.push(`  Cost:        $${context.cost.totalCostUsd.toFixed(4)}`);
  }

  if (task.costUsd !== undefined) {
    lines.push(`  Task cost:   $${task.costUsd.toFixed(4)}`);
  }

  if (context.prUrl) {
    lines.push(`  PR:          ${context.prUrl}`);
  }

  if (context.specRef) {
    lines.push(`  Spec:        ${context.specRef}`);
  }

  lines.push('');
  lines.push(
    colorize(
      '  Respond by creating a JSON file in the approvals directory.',
      'yellow',
    ),
  );
  lines.push(colorize('━'.repeat(60), 'yellow'));

  return lines.join('\n');
}

/**
 * Format a status update for terminal display.
 */
export function formatStatusUpdate(taskId: string, status: TaskStatus): string {
  const color: AnsiColor =
    status === 'completed'
      ? 'green'
      : status === 'failed'
        ? 'red'
        : 'blue';
  return colorize(`[STATUS UPDATE] ${taskId}: ${status}`, color);
}

/**
 * Return a text-based status indicator for a task status.
 */
export function statusEmoji(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    pending: '○',
    in_progress: '●',
    awaiting_approval: '⏳',
    approved: '✓',
    changes_requested: '△',
    completed: '✓',
    failed: '✗',
    paused: '⏸',
    aborting: '⏹',
    aborted: '⊘',
    blocked: '⊗',
  };
  return map[status];
}

/**
 * Format an ASCII table of tasks for `agentforge status`.
 */
export function formatTaskTable(tasks: readonly TaskSummary[]): string {
  const headers = ['ID', 'Name', 'Status', 'Cost', 'Agent'];
  const rows = tasks.map((t) => [
    t.id,
    t.name,
    `${statusEmoji(t.status)} ${t.status}`,
    t.costUsd !== undefined ? `$${t.costUsd.toFixed(4)}` : '—',
    t.assignedAgent ?? '—',
  ]);

  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, i) =>
    Math.max(...allRows.map((r) => r[i].length)),
  );

  const separator = colWidths.map((w) => '─'.repeat(w + 2)).join('┼');
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${cell.padEnd(colWidths[i])} `).join('│');

  const lines = [
    formatRow(headers),
    separator,
    ...rows.map(formatRow),
  ];

  return lines.join('\n');
}
