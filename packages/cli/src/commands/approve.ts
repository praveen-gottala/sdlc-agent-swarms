/**
 * @module @agentforge/cli/commands/approve
 *
 * The `agentforge approve <task_id>` command.
 * Updates a task's hitl_status to approved and emits HITLApprovalReceived.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg } from '../formatter.js';
import type { TasksFile, TaskEntry } from '../types.js';
import { createEventBus } from '@agentforge/core';

/**
 * Approve a task by ID, updating its HITL status.
 */
export async function approveCommand(
  taskId: string,
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
  const taskIndex = tasks.findIndex((t) => t.id === taskId);

  if (taskIndex === -1) {
    output.write(errorMsg(`Task "${taskId}" not found.\n`));
    process.exitCode = 1;
    return;
  }

  const task = tasks[taskIndex];

  if (task.hitl_status !== 'awaiting_approval') {
    output.write(errorMsg(`Task "${taskId}" is not awaiting approval (current: ${task.hitl_status}).\n`));
    process.exitCode = 1;
    return;
  }

  // Update the task
  const updatedTask: TaskEntry = { ...task, hitl_status: 'approved', status: 'approved' };
  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = updatedTask;

  const writeResult = writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);
  if (!writeResult.ok) {
    output.write(errorMsg(`Failed to write tasks file: ${writeResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  output.write(successMsg(`Task "${taskId}" approved.\n`));

  // Emit TaskStatusChanged event so listeners can react
  const bus = createEventBus();
  bus.publish({
    type: 'TaskStatusChanged',
    taskId,
    from: 'awaiting_approval',
    to: 'approved',
    timestamp: Date.now(),
  });
}
