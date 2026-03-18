/**
 * @module @agentforge/core/state/task-dependency-graph
 *
 * Task dependency graph enforcement for the orchestrator.
 * Validates dependencies, detects cycles, manages concurrency,
 * and handles blocked/unblocked state transitions.
 */

import { Ok, Err } from '../types/result.js';
import type { Result } from '../types/result.js';
import type { TaskEntry, TasksFile } from '../types/task.js';
import type { TaskStatus } from '../types/hitl.js';

/**
 * Agent slot state for concurrency tracking.
 */
export interface AgentSlot {
  readonly taskId: string;
  readonly agentId: string;
  readonly status: 'executing' | 'ci_waiting';
}

/**
 * Configuration for the dependency graph enforcer.
 */
export interface DependencyGraphConfig {
  readonly maxConcurrentAgents: number;
}

const DEFAULT_CONFIG: DependencyGraphConfig = {
  maxConcurrentAgents: 3,
};

/**
 * Detect circular dependencies using DFS.
 * Returns the cycle path if found, null otherwise.
 */
export const detectCircularDependencies = (
  tasks: readonly TaskEntry[],
): Result<null, string[]> => {
  const taskMap = new Map<string, TaskEntry>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  const dfs = (taskId: string): string[] | null => {
    if (inStack.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      return [...path.slice(cycleStart), taskId];
    }
    if (visited.has(taskId)) return null;

    visited.add(taskId);
    inStack.add(taskId);
    path.push(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const dep of task.depends_on) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }
    }

    path.pop();
    inStack.delete(taskId);
    return null;
  };

  for (const task of tasks) {
    const cycle = dfs(task.id);
    if (cycle) {
      return Err(cycle);
    }
  }

  return Ok(null);
};

/**
 * Add a task with dependency validation.
 * Rejects if adding the task would create a circular dependency,
 * or if any dependency references a non-existent task.
 */
export const addTaskWithDependencies = (
  tasks: TasksFile,
  newTask: TaskEntry,
): Result<TasksFile> => {
  // Check for duplicate
  if (tasks.tasks.find((t) => t.id === newTask.id)) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Task already exists: ${newTask.id}`,
      recoverable: false,
      taskId: newTask.id,
    });
  }

  // Validate all dependencies exist
  const taskIds = new Set(tasks.tasks.map((t) => t.id));
  for (const dep of newTask.depends_on) {
    if (!taskIds.has(dep)) {
      return Err({
        code: 'DEPENDENCY_NOT_FOUND' as const,
        message: `Dependency not found: ${dep} (referenced by ${newTask.id})`,
        recoverable: false,
        taskId: newTask.id,
      });
    }
  }

  // Check for circular dependencies with the new task included
  const allTasks = [...tasks.tasks, newTask];
  const cycleResult = detectCircularDependencies(allTasks);
  if (!cycleResult.ok) {
    return Err({
      code: 'CIRCULAR_DEPENDENCY' as const,
      message: `Circular dependency detected: ${cycleResult.error.join(' -> ')}`,
      context: { cycle: cycleResult.error },
      recoverable: false,
      taskId: newTask.id,
    });
  }

  return Ok({ tasks: allTasks });
};

/**
 * Get tasks that are ready to start (all dependencies completed).
 */
export const getReadyTasks = (tasks: TasksFile): readonly TaskEntry[] => {
  return tasks.tasks.filter((task) => {
    if (task.status !== 'pending') return false;
    if (task.depends_on.length === 0) return true;

    return task.depends_on.every((depId) => {
      const dep = tasks.tasks.find((t) => t.id === depId);
      return dep && dep.status === 'completed';
    });
  });
};

/**
 * When a blocking task completes, unblock downstream tasks
 * whose dependencies are now all satisfied.
 * Returns updated TasksFile.
 */
export const onTaskCompleted = (
  tasks: TasksFile,
  completedTaskId: string,
): TasksFile => {
  const updatedTasks = tasks.tasks.map((task) => {
    // Only unblock tasks that are blocked or pending with dependencies
    if (task.status !== 'blocked' && task.status !== 'pending') return task;
    if (!task.depends_on.includes(completedTaskId)) return task;

    // Check if all dependencies are now completed
    const allDepsCompleted = task.depends_on.every((depId) => {
      if (depId === completedTaskId) return true;
      const dep = tasks.tasks.find((t) => t.id === depId);
      return dep && dep.status === 'completed';
    });

    if (allDepsCompleted) {
      return { ...task, status: 'pending' as TaskStatus, blocked_by: null };
    }
    return task;
  });

  return { tasks: updatedTasks };
};

/**
 * When a blocking task fails, cascade 'blocked' status to all
 * downstream tasks that depend on it.
 */
export const onTaskFailed = (
  tasks: TasksFile,
  failedTaskId: string,
): TasksFile => {
  const blocked = new Set<string>();

  // Find all tasks that transitively depend on the failed task
  const findDownstream = (taskId: string): void => {
    for (const task of tasks.tasks) {
      if (blocked.has(task.id)) continue;
      if (task.depends_on.includes(taskId)) {
        blocked.add(task.id);
        findDownstream(task.id);
      }
    }
  };

  findDownstream(failedTaskId);

  const updatedTasks = tasks.tasks.map((task) => {
    if (blocked.has(task.id)) {
      return {
        ...task,
        status: 'blocked' as TaskStatus,
        blocked_by: failedTaskId,
      };
    }
    return task;
  });

  return { tasks: updatedTasks };
};

// DEVIATION: ADR-007
// PRD v2.0 Section 11.3.4 specifies: "the next independent task is assigned to a new agent instance up to the concurrency limit"
// Implementation: Enforces slot accounting (including ci_waiting); orchestrator handles agent instance lifecycle
// Rationale: see ADR-007
/**
 * Get tasks that can be scheduled given the concurrency limit.
 * CI-waiting agents DO NOT release their slot (PRD 11.3.4).
 */
export const getSchedulableTasks = (
  tasks: TasksFile,
  activeSlots: readonly AgentSlot[],
  config: DependencyGraphConfig = DEFAULT_CONFIG,
): readonly TaskEntry[] => {
  // All active slots count toward the limit (including ci_waiting)
  const usedSlots = activeSlots.length;
  const availableSlots = config.maxConcurrentAgents - usedSlots;

  if (availableSlots <= 0) return [];

  const readyTasks = getReadyTasks(tasks);
  return readyTasks.slice(0, availableSlots);
};
