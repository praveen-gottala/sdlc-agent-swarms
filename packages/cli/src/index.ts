/**
 * @module @agentforge/cli
 *
 * AgentForge CLI — Commander.js program with all SDLC commands.
 * Entry point for the `agentforge` binary.
 */

import * as path from 'node:path';
import { Command } from 'commander';
import { findProjectRoot, realFs } from './fs-utils.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { approveCommand } from './commands/approve.js';
import { abortCommand } from './commands/abort.js';
import { migrateCommand } from './commands/migrate.js';
import { configCommand } from './commands/config.js';
import { designCommand } from './commands/design.js';
import { doctorCommand } from './commands/doctor.js';

/**
 * Create the AgentForge CLI program with all commands registered.
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('agentforge')
    .description('Multi-agent framework for end-to-end SDLC orchestration')
    .version('0.1.0');

  program
    .command('init')
    .description('Initialize a new AgentForge project with guided wizard')
    .argument('[directory]', 'Target directory for the new project (created if it does not exist, defaults to current directory)')
    .action(async (directory: string | undefined) => {
      const rootDir = directory
        ? path.resolve(process.cwd(), directory)
        : process.cwd();
      await initCommand(rootDir, realFs);
    });

  program
    .command('start')
    .description('Start the orchestration engine for an SDLC phase')
    .argument('<phase>', 'SDLC phase to start (design, spec, code, cicd, observe)')
    .action(async (phase: string) => {
      const rootDir = findProjectRoot();
      await startCommand(phase, rootDir, realFs);
    });

  program
    .command('status')
    .description('View task status for the current project')
    .option('-w, --watch', 'Live-updating mode, refreshes every 2 seconds')
    .action(async (options: { watch?: boolean }) => {
      const rootDir = findProjectRoot();
      await statusCommand(options, rootDir, realFs);
    });

  program
    .command('approve')
    .description('Approve a task awaiting human review')
    .argument('<task_id>', 'ID of the task to approve')
    .option('--changes <feedback>', 'Request changes with feedback')
    .action(async (taskId: string, options: { changes?: string }) => {
      const rootDir = findProjectRoot();
      await approveCommand(taskId, rootDir, realFs, process.stdout, options);
    });

  program
    .command('abort')
    .description('Stop a running or pending task')
    .argument('[task_id]', 'ID of the task to abort')
    .option('--cleanup', 'Delete the feature branch after aborting')
    .option('--all', 'Abort all in-progress and pending tasks')
    .action(async (taskId: string | undefined, options: { cleanup?: boolean; all?: boolean }) => {
      const rootDir = findProjectRoot();
      await abortCommand(taskId, options, rootDir, realFs);
    });

  program
    .command('migrate')
    .description('Apply pending schema migrations to YAML files')
    .option('--dry', 'Show what would change without applying')
    .action(async (options: { dry?: boolean }) => {
      const rootDir = findProjectRoot();
      await migrateCommand(options, rootDir, realFs);
    });

  program
    .command('config')
    .description('View or update agentforge.yaml configuration')
    .argument('[key]', 'Dot-notation config key (e.g. budget.per_task_max_usd)')
    .argument('[value]', 'New value to set')
    .action(async (key: string | undefined, value: string | undefined) => {
      const rootDir = findProjectRoot();
      await configCommand(key, value, rootDir, realFs);
    });

  program
    .command('design')
    .description('Request a new page design from the design agent pipeline')
    .argument('<description>', 'Natural language description of the page to design')
    .action(async (description: string) => {
      const rootDir = findProjectRoot();
      await designCommand(description, rootDir, realFs);
    });

  program
    .command('doctor')
    .description('Verify that configured integrations (LLM providers, channels) are reachable')
    .action(async () => {
      const rootDir = findProjectRoot();
      await doctorCommand(rootDir, realFs);
    });

  return program;
}

export { initCommand } from './commands/init.js';
export { startCommand } from './commands/start.js';
export { statusCommand } from './commands/status.js';
export { approveCommand } from './commands/approve.js';
export { abortCommand } from './commands/abort.js';
export { migrateCommand } from './commands/migrate.js';
export { configCommand } from './commands/config.js';
export { designCommand } from './commands/design.js';
export { doctorCommand } from './commands/doctor.js';
export type { InitAnswers } from './commands/init.js';
export type { ProjectManifest, TaskEntry, TasksFile } from './types.js';
export { formatTaskTable, formatTaskRow } from './formatter.js';
