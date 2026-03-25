/**
 * @module @agentforge/agents-spec/task-decomposer
 *
 * Task Decomposer agent: breaks specs into discrete implementable tasks
 * with dependency ordering and agent assignment.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  TaskEntry,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
  loadTasks,
  saveTasks,
  addTask,
} from '@agentforge/core';
import { validateDependencyGraph } from './validate-graph.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the task decomposer agent. */
export interface TaskDecomposerInput {
  readonly specRef: string;
  readonly taskId: string;
}

/** Output produced by the task decomposer agent. */
export interface TaskDecomposerOutput {
  readonly taskCount: number;
  readonly taskIds: readonly string[];
}

/** Shape of a task in the LLM output. */
interface RawTask {
  readonly id: string;
  readonly title: string;
  readonly phase: string;
  readonly agent: string;
  readonly depends_on: string[];
  readonly spec_ref: string;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the task decomposer. */
export const TASK_DECOMPOSER_CONTRACT: AgentContract = {
  role: 'task_decomposer',
  description: 'Decomposes technical specs into discrete implementable tasks',
  category: 'spec',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 200000 },
  tools: [],
  permissions: ['read_spec', 'write_tasks'],
  denied: [],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 1.0 },
  on_complete: 'TasksCreated',
  on_error: 'retry(max=1) then notify_human',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'task-decomposer-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function
// ============================================================================

/** Parse the LLM output as a JSON array of tasks. */
const parseTasksFromOutput = (output: string): Result<RawTask[]> => {
  // Extract JSON array from output (may be wrapped in ```json blocks)
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (!Array.isArray(parsed)) {
      return Err({
        code: 'LLM_MALFORMED_OUTPUT' as const,
        message: 'Expected JSON array of tasks',
        recoverable: true,
      });
    }
    return Ok(parsed as RawTask[]);
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse task JSON: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

/**
 * The task decomposer's work function.
 * Called by runAgent after governance clears.
 */
export const taskDecomposerWork: AgentWorkFn<TaskDecomposerInput, TaskDecomposerOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { specRef } = input;

  // 1. Read spec files
  const specDir = join(context.projectRoot, specRef);
  const specsResult = readSpecs(specDir, context.fs);
  if (!specsResult.ok) {
    return Err(specsResult.error);
  }

  // 2. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Spec content:\n${JSON.stringify(specsResult.value, null, 2)}`,
    learnings.length > 0 ? `\nLearnings:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? TASK_DECOMPOSER_CONTRACT.provider,
    maxTokens: 4000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 4. Parse tasks
  const parseResult = parseTasksFromOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult as Result<never>;
  }
  const rawTasks = parseResult.value;

  // 5. Validate dependency graph
  const graphResult = validateDependencyGraph(rawTasks);
  if (!graphResult.ok) {
    return Err(graphResult.error);
  }

  // 6. Load existing tasks and add new ones
  let tasksFile = loadTasks(context.projectRoot, context.fs);
  let currentTasks = tasksFile.ok ? tasksFile.value : { tasks: [] };
  const taskIds: string[] = [];

  for (const raw of rawTasks) {
    const entry: TaskEntry = {
      id: raw.id,
      title: raw.title,
      phase: raw.phase,
      agent: raw.agent,
      status: 'pending',
      depends_on: raw.depends_on,
      spec_ref: raw.spec_ref,
      branch: null,
      pr_number: null,
      cost_usd: 0,
      tokens_used: 0,
      attempts: 0,
      max_attempts: 3,
      hitl_status: 'none',
      hitl_channel: null,
    };

    const addResult = addTask(currentTasks, entry);
    if (!addResult.ok) {
      return Err(addResult.error);
    }
    currentTasks = addResult.value;
    taskIds.push(raw.id);
  }

  // 7. Save tasks
  const saveResult = saveTasks(context.projectRoot, currentTasks, context.fs);
  if (!saveResult.ok) {
    return Err(saveResult.error);
  }

  return Ok({ taskCount: rawTasks.length, taskIds });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the task decomposer agent through the full governance pipeline.
 */
export const executeTaskDecomposer = async (
  contract: AgentContract,
  context: AgentContext,
  input: TaskDecomposerInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_tasks',
    input.specRef,
    `Decompose specs at ${input.specRef} into tasks`,
    taskDecomposerWork,
  );
};

/**
 * Register the task decomposer to respond to SpecComplete events.
 */
export const registerTaskDecomposer = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = TASK_DECOMPOSER_CONTRACT,
): void => {
  eventBus.subscribe('SpecComplete', (event) => {
    const input: TaskDecomposerInput = {
      specRef: event.specRef,
      taskId: event.taskId,
    };
    void executeTaskDecomposer(contract, context, input);
  });
};
