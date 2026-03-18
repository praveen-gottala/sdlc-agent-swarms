/**
 * @module @agentforge/core/types/task
 *
 * Types representing the agentforge.tasks.yaml task state file.
 */

import type { TaskStatus } from './hitl.js';

/**
 * A single task entry in agentforge.tasks.yaml.
 */
export interface TaskEntry {
  readonly id: string;
  readonly title: string;
  readonly phase: string;
  readonly agent: string;
  readonly status: TaskStatus;
  readonly depends_on: readonly string[];
  readonly spec_ref: string;
  readonly branch: string | null;
  readonly pr_number: number | null;
  readonly cost_usd: number;
  readonly tokens_used: number;
  readonly attempts: number;
  readonly max_attempts: number;
  readonly hitl_status: string;
  readonly hitl_channel: string | null;
}

/**
 * The full agentforge.tasks.yaml file.
 */
export interface TasksFile {
  readonly tasks: readonly TaskEntry[];
}
