/**
 * @module @agentforge/cli/commands/abort
 *
 * The `agentforge abort <task_id> [--cleanup] [--all]` command.
 * Sets tasks to 'aborting' status first, calls the engine, then polls
 * until the task reaches 'aborted'/'failed'. With --cleanup, deletes
 * the feature branch. With --all, aborts every in-progress/pending task.
 */

import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { readYaml, writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, errorMsg, infoMsg } from '../formatter.js';
import type { TasksFile, TaskEntry } from '../types.js';
import { createEventBus, writeBridgeEvent } from '@agentforge/core';
import type { TaskStatus } from '@agentforge/core';
import { createEngineClient, type EngineClient } from '../engine-client.js';

const ABORTABLE_STATUSES: readonly TaskStatus[] = [
  'pending',
  'in_progress',
  'awaiting_approval',
  'paused',
];

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 30_000;

/**
 * Set a single task to aborting status.
 */
function markAborting(task: TaskEntry): TaskEntry {
  return {
    ...task,
    status: 'aborting' as TaskStatus,
    hitl_status: 'aborting',
  };
}

/**
 * Finalize a task to aborted status.
 */
function markAborted(task: TaskEntry, cleanup: boolean): TaskEntry {
  return {
    ...task,
    status: 'aborted' as TaskStatus,
    hitl_status: 'aborted',
    branch: cleanup ? null : task.branch,
  };
}

/**
 * Emit AgentAborted event and write to file bridge.
 */
function emitAbortEvent(
  taskId: string,
  agentId: string,
  reason: string,
  rootDir: string,
): void {
  const bus = createEventBus();
  const event = {
    type: 'AgentAborted' as const,
    agentId,
    taskId,
    reason,
    source: 'cli',
    timestamp: Date.now(),
  };
  bus.publish(event);
  writeBridgeEvent(rootDir, event);
}

/**
 * Poll task status in YAML until it reaches a terminal state.
 */
async function pollUntilAborted(
  taskId: string,
  tasksPath: string,
  fileSystem: FileSystem,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<TaskStatus> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = readYaml<TasksFile>(tasksPath, fileSystem);
    if (result.ok) {
      const task = result.value.tasks.find((t) => t.id === taskId);
      if (task && (task.status === 'aborted' || task.status === 'failed')) {
        return task.status;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return 'aborting' as TaskStatus;
}

/**
 * Delete a remote branch, wrapped in try/catch.
 */
function cleanupBranch(branch: string, output: NodeJS.WritableStream): void {
  try {
    execSync(`git push origin --delete ${branch}`, { stdio: 'pipe' });
    output.write(infoMsg(`Deleted remote branch "${branch}".\n`));
  } catch {
    output.write(infoMsg(`Could not delete branch "${branch}" (may not exist remotely).\n`));
  }
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
  clientOverride?: EngineClient,
  pollTimeoutMs: number = POLL_TIMEOUT_MS,
): Promise<void> {
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  const result = readYaml<TasksFile>(tasksPath, fileSystem);

  if (!result.ok) {
    output.write(errorMsg('No agentforge.tasks.yaml found.\n'));
    process.exitCode = 1;
    return;
  }

  const { tasks } = result.value;
  const client = clientOverride ?? createEngineClient();

  // Read active thread for --all pause
  const threadPath = path.join(rootDir, '.agentforge', 'active-thread.yaml');
  const threadResult = readYaml<{ threadId: string }>(threadPath, fileSystem);

  if (options.all) {
    const abortable = tasks.filter((t) =>
      (ABORTABLE_STATUSES as readonly string[]).includes(t.status),
    );

    if (abortable.length === 0) {
      output.write(infoMsg('No tasks to abort.\n'));
      return;
    }

    // Pause phase first if thread is active
    if (threadResult.ok) {
      await client.pausePhase(threadResult.value.threadId);
    }

    // Set all to aborting
    let updatedTasks = tasks.map((t) =>
      (ABORTABLE_STATUSES as readonly string[]).includes(t.status)
        ? markAborting(t)
        : t,
    );
    writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);

    // Notify engine + emit events for each
    for (const t of abortable) {
      await client.abortTask(t.id);
      emitAbortEvent(t.id, t.agent, 'User requested abort --all', rootDir);
    }

    // Finalize all to aborted
    updatedTasks = updatedTasks.map((t) =>
      t.status === ('aborting' as TaskStatus)
        ? markAborted(t, options.cleanup ?? false)
        : t,
    );
    writeYaml(tasksPath, { tasks: updatedTasks }, fileSystem);

    // Cleanup branches if requested
    if (options.cleanup) {
      for (const t of abortable) {
        if (t.branch) {
          cleanupBranch(t.branch, output);
        }
      }
    }

    output.write(successMsg(`Aborted ${abortable.length} task(s).\n`));
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

  // Step 1: Set to aborting
  const abortingTasks = [...tasks];
  abortingTasks[taskIndex] = markAborting(task);
  writeYaml(tasksPath, { tasks: abortingTasks }, fileSystem);

  output.write(infoMsg(`Task "${taskId}" set to aborting...\n`));

  // Step 2: Emit AgentAborted event
  emitAbortEvent(taskId, task.agent, 'User requested abort', rootDir);

  // Step 3: Call engine
  await client.abortTask(taskId);

  // Step 4: Poll until aborted/failed
  const finalStatus = await pollUntilAborted(taskId, tasksPath, fileSystem, pollTimeoutMs);

  // Step 5: Finalize to aborted in YAML
  const finalResult = readYaml<TasksFile>(tasksPath, fileSystem);
  if (finalResult.ok) {
    const finalTasks = [...finalResult.value.tasks];
    const idx = finalTasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      finalTasks[idx] = markAborted(finalTasks[idx], options.cleanup ?? false);
      writeYaml(tasksPath, { tasks: finalTasks }, fileSystem);
    }
  }

  // Step 6: Cleanup branch if requested
  if (options.cleanup && task.branch) {
    cleanupBranch(task.branch, output);
  }

  output.write(successMsg(`Task "${taskId}" aborted (final status: ${finalStatus}).\n`));
  if (!options.cleanup && task.branch) {
    output.write(infoMsg(`Branch "${task.branch}" preserved for inspection.\n`));
  }
}
