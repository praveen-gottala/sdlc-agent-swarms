/**
 * @module @agentforge/cli/commands/abort
 *
 * The `agentforge abort <task_id> [--cleanup] [--all]` command.
 * Sets tasks to aborting status. With --cleanup, marks branches for deletion.
 * With --all, aborts every in-progress or pending task.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { TasksFile, TaskEntry } from '../types.js';
import { createEventBus } from '@agentforge/core';
import type { TaskStatus } from '@agentforge/core';

const ABORTABLE_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'awaiting_approval',
  'paused',
];

/**
 * Abort a single task by setting it to aborting status.
 */
function abortTask(task: TaskEntry, cleanup: boolean): TaskEntry {
  return {
    ...task,
    status: 'failed' as TaskStatus, // aborting -> eventually aborted
    hitl_status: 'aborted',
    branch: cleanup ? null : task.branch,
  };
}

/**
 * Execute the abort command.
 */
export async function abortCommand(
  taskId: string | undefined,
  options: { cleanup?: boolean; all?: boolean },
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  const result = readYaml<TasksFile>(tasksPath, fileSystem);

  if (!result.ok) {
    output.write(errorMsg('No agentforge.tasks.yaml found.\n'));
    process.exitCode = 1;
    return;
  }

  const { tasks } = result.value;

  if (options.all) {
    const abortable = tasks.filter((t) =>
      (ABORTABLE_STATUSES as readonly string[]).includes(t.status),
    );

    if (abortable.length === 0) {
      output.write(infoMsg('No tasks to abort.\n'));
      return;
    }

    const updatedTasks = tasks.map((t) =>
      (ABORTABLE_STATUSES as readonly string[]).includes(t.status)
        ? abortTask(t, options.cleanup ?? false)
        : t,
    );

    const writeResult = writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);
    if (!writeResult.ok) {
      output.write(errorMsg(`Failed to write tasks file: ${writeResult.error.message}\n`));
      process.exitCode = 1;
      return;
    }

    // Emit TaskStatusChanged for each aborted task
    const bus = createEventBus();
    for (const t of abortable) {
      bus.publish({
        type: 'TaskStatusChanged',
        taskId: t.id,
        from: t.status,
        to: 'failed',
        timestamp: Date.now(),
      });
    }

    output.write(successMsg(`Aborted ${abortable.length} task(s).\n`));
    if (options.cleanup) {
      output.write(infoMsg('Branches marked for cleanup.\n'));
    }
    return;
  }

  if (!taskId) {
    output.write(errorMsg('Provide a task ID or use --all.\n'));
    process.exitCode = 1;
    return;
  }

  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    output.write(errorMsg(`Task "${taskId}" not found.\n`));
    process.exitCode = 1;
    return;
  }

  const task = tasks[taskIndex];

  if (!(ABORTABLE_STATUSES as readonly string[]).includes(task.status)) {
    output.write(errorMsg(`Task "${taskId}" cannot be aborted (status: ${task.status}).\n`));
    process.exitCode = 1;
    return;
  }

  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = abortTask(task, options.cleanup ?? false);

  const writeResult = writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);
  if (!writeResult.ok) {
    output.write(errorMsg(`Failed to write tasks file: ${writeResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  // Emit TaskStatusChanged event
  const bus = createEventBus();
  bus.publish({
    type: 'TaskStatusChanged',
    taskId,
    from: task.status,
    to: 'failed',
    timestamp: Date.now(),
  });

  output.write(successMsg(`Task "${taskId}" aborted.\n`));
  if (options.cleanup) {
    output.write(infoMsg(`Branch "${task.branch}" marked for cleanup.\n`));
  } else if (task.branch) {
    output.write(infoMsg(`Branch "${task.branch}" preserved for inspection.\n`));
  }
}
