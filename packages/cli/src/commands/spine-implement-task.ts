/**
 * CLI command: spine:implement
 *
 * Runs the Implementer on a single task from the Architect's TaskPlan.
 * Reads the task plan from disk, selects a task by ID, and invokes
 * the Implementer LangGraph pipeline.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readYaml, createRealFs } from '@agentforge/core';
import type { TaskPlan, TaskNode } from '@agentforge/core';
import {
  resolveClaudeAuth,
  authResultToProviderConfig,
  createClaudeProvider,
} from '@agentforge/providers';
import { createTracedProvider, initLangfuseTracing } from '@agentforge/telemetry';
import { runImplementerPipelineStream } from '@agentforge/agents-implementer';

interface SpineImplementOptions {
  readonly taskId?: string;
  readonly provider?: string;
  readonly taskPlanPath?: string;
}

export async function spineImplementCommand(
  rootDir: string,
  options: SpineImplementOptions,
): Promise<void> {
  const auth = resolveClaudeAuth();
  if (!auth) {
    console.error('Error: No Claude API authentication configured.');
    process.exitCode = 1;
    return;
  }

  const planPath = options.taskPlanPath
    ?? join(rootDir, '.agentforge', 'architect', 'task-plan.yaml');

  if (!existsSync(planPath)) {
    console.error(`Error: Task plan not found at ${planPath}`);
    console.error('Run the Architect pipeline first to generate a task plan.');
    process.exitCode = 1;
    return;
  }

  const fs = createRealFs();
  const planResult = readYaml<TaskPlan>(planPath, fs);
  if (!planResult.ok) {
    console.error(`Error: Failed to read task plan: ${planResult.error}`);
    process.exitCode = 1;
    return;
  }

  const taskPlan = planResult.value;
  let task: TaskNode | undefined;

  if (options.taskId) {
    task = taskPlan.tasks.find((t) => t.id === options.taskId);
    if (!task) {
      console.error(`Error: Task "${options.taskId}" not found in task plan.`);
      console.error(`Available tasks: ${taskPlan.tasks.map((t) => t.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }
  } else {
    task = taskPlan.tasks.find((t) => t.writeOrder === 0)
      ?? taskPlan.tasks[0];
    if (!task) {
      console.error('Error: No tasks in task plan.');
      process.exitCode = 1;
      return;
    }
    console.log(`No --task-id specified, using first task: ${task.id} (${task.title})`);
  }

  initLangfuseTracing();

  const model = options.provider ?? 'claude-opus-4-6';
  const authConfig = authResultToProviderConfig(auth);
  const provider = createTracedProvider(createClaudeProvider(model, authConfig));

  console.log(`\nImplementing task: ${task.id} — ${task.title}`);
  console.log(`  Type: ${task.type}, Mode: ${task.mode}`);
  console.log(`  Files: ${task.filePaths.join(', ')}`);
  console.log('');

  const contractBundlePath = join(rootDir, '.agentforge', 'architect', 'contract-bundle.yaml');
  let contractBundle = {};
  if (existsSync(contractBundlePath)) {
    const bundleResult = readYaml<Record<string, unknown>>(contractBundlePath, fs);
    if (bundleResult.ok) {
      contractBundle = bundleResult.value;
    }
  }

  try {
    for await (const event of runImplementerPipelineStream({
      task,
      contractBundle,
      provider,
      projectRoot: rootDir,
      projectId: taskPlan.projectId,
    })) {
      switch (event.type) {
        case 'node-complete':
          console.log(`  [${event.node}] completed in ${(event.durationMs / 1000).toFixed(1)}s`);
          break;
        case 'complete': {
          const report = event.state.completionReport;
          console.log('\nImplementation complete!');
          if (report) {
            console.log(`  Files written: ${report.filesWritten.length}`);
            for (const f of report.filesWritten) {
              console.log(`    - ${f}`);
            }
            if (report.deviationsFromContract.length > 0) {
              console.log(`  Deviations: ${report.deviationsFromContract.length}`);
              for (const d of report.deviationsFromContract) {
                console.log(`    - ${d}`);
              }
            }
          }
          break;
        }
        case 'error':
          console.error(`\nError: ${event.error.code} — ${event.error.message}`);
          process.exitCode = 1;
          break;
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nUnexpected error: ${msg}`);
    process.exitCode = 1;
  }
}
