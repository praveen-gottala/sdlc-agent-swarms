/**
 * @module @agentforge/cli/formatter
 *
 * Formats task data for terminal display.
 * Pure functions — no side effects, easy to test.
 */

import type { TaskEntry } from './types.js';

/** Status indicator symbols with ANSI color codes. */
const STATUS_ICONS: Record<string, string> = {
  pending: '\x1b[90m○\x1b[0m',        // gray
  in_progress: '\x1b[34m●\x1b[0m',    // blue
  awaiting_approval: '\x1b[33m◉\x1b[0m', // yellow
  approved: '\x1b[32m✓\x1b[0m',       // green
  changes_requested: '\x1b[35m✎\x1b[0m', // magenta
  completed: '\x1b[32m✔\x1b[0m',      // green
  failed: '\x1b[31m✗\x1b[0m',         // red
  paused: '\x1b[90m⏸\x1b[0m',         // gray
  aborting: '\x1b[31m⏹\x1b[0m',       // red
  aborted: '\x1b[31m⊘\x1b[0m',        // red
};

/**
 * Format a single task as a table row string.
 */
export function formatTaskRow(task: TaskEntry): string {
  const icon = STATUS_ICONS[task.status] ?? '?';
  const cost = task.cost_usd > 0 ? `$${task.cost_usd.toFixed(2)}` : '-';
  const status = task.status.padEnd(20);
  return `  ${icon} ${task.id.padEnd(12)} ${status} ${cost.padStart(8)}  ${task.title}`;
}

/**
 * Format the full task table with header.
 */
export function formatTaskTable(tasks: readonly TaskEntry[], phase?: string): string {
  const lines: string[] = [];

  if (phase) {
    lines.push(`\x1b[1mPhase: ${phase}\x1b[0m`);
  }

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const totalCost = tasks.reduce((sum, t) => sum + t.cost_usd, 0);

  lines.push(`Tasks: ${completed}/${total} completed, ${inProgress} in progress | Cost: $${totalCost.toFixed(2)}`);
  lines.push('');
  lines.push(`  ${''.padEnd(2)} ${'ID'.padEnd(12)} ${'STATUS'.padEnd(20)} ${'COST'.padStart(8)}  TITLE`);
  lines.push(`  ${'─'.repeat(70)}`);

  for (const task of tasks) {
    lines.push(formatTaskRow(task));
  }

  return lines.join('\n');
}

/**
 * Format a success message.
 */
export function successMsg(message: string): string {
  return `\x1b[32m✔\x1b[0m ${message}`;
}

/**
 * Format an error message.
 */
export function errorMsg(message: string): string {
  return `\x1b[31m✗\x1b[0m ${message}`;
}

/**
 * Format a warning message.
 */
export function warnMsg(message: string): string {
  return `\x1b[33m⚠\x1b[0m ${message}`;
}

/**
 * Format an info message.
 */
export function infoMsg(message: string): string {
  return `\x1b[34mℹ\x1b[0m ${message}`;
}
