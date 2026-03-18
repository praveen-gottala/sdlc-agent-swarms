/**
 * @module @agentforge/core/state/task-manager
 *
 * Pure functions for managing task state in agentforge.tasks.yaml.
 * All mutations return new TasksFile instances (immutable updates).
 */

import * as path from 'node:path';
import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { TaskEntry, TasksFile } from '../types/task.js';
import type { TaskStatus } from '../types/hitl.js';
import type { FileSystem } from '../fs/file-system.js';
import { readYaml, writeYaml } from '../fs/yaml-utils.js';

/** Valid task state transitions. */
const VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  pending: ['in_progress', 'blocked'],
  in_progress: ['awaiting_approval', 'completed', 'failed', 'paused', 'blocked'],
  awaiting_approval: ['approved', 'changes_requested'],
  approved: ['in_progress', 'completed'],
  changes_requested: ['in_progress'],
  failed: ['pending'],
  completed: [],
  paused: ['in_progress'],
  blocked: ['pending', 'in_progress'],
};

/**
 * Load tasks from agentforge.tasks.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param fs - FileSystem implementation to use for reading
 * @returns The parsed TasksFile, or an error Result
 */
export const loadTasks = (
  projectRoot: string,
  fs: FileSystem,
): Result<TasksFile> => {
  return readYaml<TasksFile>(
    path.join(projectRoot, 'agentforge.tasks.yaml'),
    fs,
  );
};

/**
 * Save tasks to agentforge.tasks.yaml.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param tasks - The TasksFile to serialize and write
 * @param fs - FileSystem implementation to use for writing
 * @returns Void on success, or an error Result
 */
export const saveTasks = (
  projectRoot: string,
  tasks: TasksFile,
  fs: FileSystem,
): Result<void> => {
  return writeYaml(
    path.join(projectRoot, 'agentforge.tasks.yaml'),
    tasks,
    fs,
  );
};

/**
 * Get a specific task by ID.
 *
 * @param tasks - The TasksFile to search
 * @param taskId - The ID of the task to find
 * @returns The matching TaskEntry, or a TASK_NOT_FOUND error
 */
export const getTask = (
  tasks: TasksFile,
  taskId: string,
): Result<TaskEntry> => {
  const task = tasks.tasks.find((t) => t.id === taskId);
  if (!task) {
    return Err({
      code: 'TASK_NOT_FOUND',
      message: `Task not found: ${taskId}`,
      recoverable: false,
    });
  }
  return Ok(task);
};

/**
 * Update a task's status, validating the state transition.
 * Returns a new TasksFile with the updated task (immutable).
 *
 * @param tasks - The current TasksFile
 * @param taskId - The ID of the task to update
 * @param newStatus - The desired new status
 * @returns A new TasksFile with the updated task, or an error Result
 */
export const updateTaskStatus = (
  tasks: TasksFile,
  taskId: string,
  newStatus: TaskStatus,
): Result<TasksFile> => {
  const taskResult = getTask(tasks, taskId);
  if (!taskResult.ok) return taskResult;

  const task = taskResult.value;
  const allowed = VALID_TRANSITIONS[task.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return Err({
      code: 'INVALID_STATE',
      message: `Invalid transition: ${task.status} → ${newStatus} for task ${taskId}`,
      context: { currentStatus: task.status, requestedStatus: newStatus },
      recoverable: false,
      taskId,
    });
  }

  const updatedTasks = tasks.tasks.map((t) =>
    t.id === taskId ? { ...t, status: newStatus } : t,
  );
  return Ok({ tasks: updatedTasks });
};

/**
 * Add a new task. Returns a new TasksFile with the task appended.
 *
 * @param tasks - The current TasksFile
 * @param task - The new TaskEntry to add
 * @returns A new TasksFile with the task added, or an error if the ID already exists
 */
export const addTask = (
  tasks: TasksFile,
  task: TaskEntry,
): Result<TasksFile> => {
  const existing = tasks.tasks.find((t) => t.id === task.id);
  if (existing) {
    return Err({
      code: 'INVALID_STATE',
      message: `Task already exists: ${task.id}`,
      recoverable: false,
      taskId: task.id,
    });
  }
  return Ok({ tasks: [...tasks.tasks, task] });
};
