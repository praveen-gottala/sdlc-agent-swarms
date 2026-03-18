/**
 * @module @agentforge/cli/commands/status
 *
 * The `agentforge status [--watch]` command.
 * Reads agentforge.tasks.yaml and prints a formatted task table.
 * Watch mode refreshes every 2 seconds.
 */

import * as path from 'node:path';
import { readYaml, type FileSystem, realFs } from '../fs-utils.js';
import { formatTaskTable, infoMsg, errorMsg } from '../formatter.js';
import type { TasksFile } from '../types.js';

/**
 * Read and display the current task status.
 * Returns true if tasks were found, false otherwise.
 */
export function printStatus(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): boolean {
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  const result = readYaml<TasksFile>(tasksPath, fileSystem);

  if (!result.ok) {
    output.write(errorMsg('No agentforge.tasks.yaml found. Run "agentforge init" first.\n'));
    return false;
  }

  const { tasks } = result.value;

  if (tasks.length === 0) {
    output.write(infoMsg('No tasks yet. Run "agentforge start <phase>" to begin.\n'));
    return true;
  }

  // Group by phase
  const phases = [...new Set(tasks.map((t) => t.phase))];
  for (const phase of phases) {
    const phaseTasks = tasks.filter((t) => t.phase === phase);
    output.write(formatTaskTable(phaseTasks, phase) + '\n\n');
  }

  return true;
}

/**
 * Execute the status command, optionally in watch mode.
 */
export async function statusCommand(
  options: { watch?: boolean },
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  if (!options.watch) {
    printStatus(rootDir, fileSystem, output);
    return;
  }

  // Watch mode: clear screen and refresh every 2 seconds
  const refresh = (): void => {
    output.write('\x1b[2J\x1b[H'); // clear screen, move cursor to top
    output.write(`\x1b[90m[watching — refreshing every 2s, Ctrl+C to stop]\x1b[0m\n\n`);
    printStatus(rootDir, fileSystem, output);
  };

  refresh();
  const interval = setInterval(refresh, 2000);

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    clearInterval(interval);
    output.write('\n');
    process.exit(0);
  });

  // Keep process alive
  await new Promise<void>(() => {
    // never resolves — user must Ctrl+C
  });
}
