/**
 * @module @agentforge/cli/commands/approve
 *
 * The `agentforge approve <task_id> [--changes <feedback>]` command.
 * Updates a task's hitl_status to approved (or changes_requested) and
 * emits HITLApproved + writes to file bridge for the Python engine.
 */

import * as path from 'node:path';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { TasksFile, TaskEntry } from '../types.js';
import { createEventBus, writeBridgeEvent } from '@agentforge/core';
import type { TaskStatus } from '@agentforge/core';
import { createEngineClient, type EngineClient } from '../engine-client.js';

/**
 * Approve a task by ID, or request changes with feedback.
 */
export async function approveCommand(
  taskId: string,
  rootDir: string,
  fileSystem: FileSystem = realFs,
  output: NodeJS.WritableStream = process.stdout,
  options: { changes?: string } = {},
  clientOverride?: EngineClient,
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

  // Determine decision
  const isChangesRequested = !!options.changes;
  const newStatus: TaskStatus = isChangesRequested ? 'changes_requested' : 'approved';
  const decision = isChangesRequested ? 'changes_requested' : 'approved';

  // Update the task
  const updatedTask: TaskEntry = {
    ...task,
    hitl_status: decision,
    status: newStatus,
  };
  const updatedTasks = [...tasks];
  updatedTasks[taskIndex] = updatedTask;

  const writeResult = writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);
  if (!writeResult.ok) {
    output.write(errorMsg(`Failed to write tasks file: ${writeResult.error.message}\n`));
    process.exitCode = 1;
    return;
  }

  // Emit HITLApproved event on in-memory bus
  const bus = createEventBus();
  const hitlEvent = {
    type: 'HITLApproved' as const,
    gateId: taskId,
    decision,
    feedback: options.changes,
    source: 'cli',
    timestamp: Date.now(),
  };
  bus.publish(hitlEvent);

  // Write to file bridge for Python engine
  writeBridgeEvent(rootDir, hitlEvent);

  // Notify engine via REST if active thread exists
  const threadPath = path.join(rootDir, '.agentforge', 'active-thread.yaml');
  const threadResult = readYaml<{ threadId: string }>(threadPath, fileSystem);
  if (threadResult.ok) {
    const client = clientOverride ?? createEngineClient();
    const apiResult = await client.approveGate(
      threadResult.value.threadId,
      taskId,
      decision,
      options.changes,
    );
    if (!apiResult.ok) {
      output.write(infoMsg(`Warning: engine notification failed: ${apiResult.error.message}\n`));
    }
  }

  if (isChangesRequested) {
    output.write(successMsg(`Changes requested for "${taskId}": ${options.changes}\n`));
  } else {
    output.write(successMsg(`Task "${taskId}" approved.\n`));
  }
}
