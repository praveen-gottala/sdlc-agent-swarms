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
import { designFigmaCommand } from './commands/design-figma.js';
import { designCollaborateCommand } from './commands/design-collaborate.js';
import { designPenpotCommand } from './commands/design-penpot.js';
import { designPenpotAllCommand } from './commands/design-penpot-all.js';
import { designPenpotBrowserCommand } from './commands/design-penpot-browser.js';
import { doctorCommand } from './commands/doctor.js';
import { setupCommand } from './commands/setup.js';
import {
  designSystemShowCommand,
  designSystemUpdateCommand,
  designSystemValidateCommand,
} from './commands/design-system.js';
import { designGenerateCommand } from './commands/design-generate.js';
import { describeCommand } from './commands/describe.js';
import { designPreviewCommand } from './commands/design-preview.js';
import { designPenpotReviewCommand } from './commands/design-penpot-review.js';
import { designListCommand } from './commands/design-list.js';

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
    .command('describe')
    .description('Describe your app — provide a PRD or answer questions to generate one')
    .action(async () => {
      const rootDir = findProjectRoot();
      await describeCommand(rootDir, realFs);
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
    .command('design:figma')
    .description('Create a Figma design via the UX agent pipeline (Research → Planning → Design)')
    .argument('<description>', 'Natural language description of what to design')
    .option('--stage <stage>', 'Skip to a stage: research, planning, design, replay, connect')
    .option('--module <id>', 'Module ID (default: derived from description)')
    .option('--no-wait', 'Exit after design without waiting for approval')
    .option('--implement', 'Skip feedback loop and generate code directly after design')
    .action(async (description: string, options: { stage?: string; module?: string; wait?: boolean; implement?: boolean }) => {
      await designFigmaCommand(description, process.stdout, {
        stage: options.stage as 'research' | 'planning' | 'design' | undefined,
        module: options.module,
        noWait: options.wait === false,
        implement: options.implement,
      });
    });

  program
    .command('design:collaborate')
    .description('Resume an existing Figma design for interactive human-agent collaboration')
    .requiredOption('--module <id>', 'Module ID of the design to collaborate on')
    .option('--tool <tool>', 'Design tool to use: figma or penpot (default: figma)')
    .action(async (options: { module: string; tool?: string }) => {
      await designCollaborateCommand(process.stdout, { module: options.module, tool: options.tool as 'figma' | 'penpot' | undefined });
    });

  program
    .command('design:penpot')
    .description('Create a Penpot design via the UX agent pipeline (Research -> Planning -> Design)')
    .argument('<description>', 'Natural language description of what to design')
    .option('--stage <stage>', 'Skip to a stage: research, planning, design, replay, connect')
    .option('--module <id>', 'Module ID (default: derived from description)')
    .option('--no-wait', 'Exit after design without waiting for approval')
    .option('--implement', 'Skip feedback loop and generate code directly after design')
    .action(async (description: string, options: { stage?: string; module?: string; wait?: boolean; implement?: boolean }) => {
      await designPenpotCommand(description, process.stdout, {
        stage: options.stage as 'research' | 'planning' | 'design' | 'replay' | 'connect' | undefined,
        module: options.module,
        noWait: options.wait === false,
        implement: options.implement,
      });
    });

  program
    .command('design:penpot:all')
    .description('Design all screens from pages.yaml in Penpot (reads project spec automatically)')
    .option('--pages <ids>', 'Only design specific pages (comma-separated IDs, e.g. "home,book-detail")')
    .option('--design-only', 'Skip research+planning, use cached artifacts')
    .action(async (options: { pages?: string; designOnly?: boolean }) => {
      await designPenpotAllCommand(process.stdout, options);
    });

  program
    .command('design:penpot:browser')
    .description('Create a Penpot design with Playwright browser automation (screenshots + state reading)')
    .argument('<description>', 'Natural language description of what to design')
    .option('--stage <stage>', 'Skip to a stage: research, planning, design (loads prior from cache)')
    .option('--module <id>', 'Module ID (default: derived from description)')
    .option('--headless', 'Run browser headless (default: headed)')
    .option('--no-wait', 'Exit after design without waiting for approval')
    .option('--implement', 'Skip feedback loop and generate code directly after design')
    .action(async (description: string, options: { stage?: string; module?: string; headless?: boolean; wait?: boolean; implement?: boolean }) => {
      await designPenpotBrowserCommand(description, process.stdout, {
        stage: options.stage as 'research' | 'planning' | 'design' | undefined,
        module: options.module,
        headless: options.headless ?? false,
        noWait: options.wait === false,
        implement: options.implement,
      });
    });

  program
    .command('design:penpot:review')
    .description('Review and interactively improve an existing Penpot design via browser agent')
    .requiredOption('--url <url>', 'Penpot workspace URL (user must be logged in)')
    .option('--page <id>', 'Page ID from pages.yaml to focus evaluation on')
    .option('--headless', 'Run browser headless')
    .action(async (options: { url: string; page?: string; headless?: boolean }) => {
      await designPenpotReviewCommand(process.stdout, options);
    });

  const designSystem = program
    .command('design-system')
    .description('Manage the project design system (tokens, brand, validation)');

  designSystem
    .command('show')
    .description('Display the current design system configuration')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designSystemShowCommand(rootDir, realFs, process.stdout);
    });

  designSystem
    .command('update')
    .description('Re-run design archetype selection and overwrite design system files')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designSystemUpdateCommand(rootDir, realFs, process.stdin, process.stdout);
    });

  designSystem
    .command('validate')
    .description('Validate design-tokens.yaml and brand.yaml for internal consistency')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designSystemValidateCommand(rootDir, realFs, process.stdout);
    });

  program
    .command('design:generate')
    .description('Generate a complete app spec (pages, models, API) from your project description using AI')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designGenerateCommand(rootDir, realFs);
    });

  program
    .command('design:preview')
    .description('Open the design system and app spec preview in your browser')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designPreviewCommand(rootDir, realFs);
    });

  program
    .command('design:list')
    .description('List all designs in the previews directory with status and metadata')
    .action(async () => {
      await designListCommand(process.stdout);
    });

  program
    .command('doctor')
    .description('Verify that configured integrations (LLM providers, channels) are reachable')
    .action(async () => {
      const rootDir = findProjectRoot();
      await doctorCommand(rootDir, realFs);
    });

  program
    .command('setup')
    .description('Set up the Python orchestration engine (auto-runs on first "agentforge start")')
    .action(async () => {
      const rootDir = findProjectRoot();
      await setupCommand(rootDir);
    });

  return program;
}

export { initCommand, buildManifest, scaffoldProject, buildDesignTokensSpec, buildBrandSpec, generateTailwindConfig, generateGlobalCss } from './commands/init.js';
export { startCommand } from './commands/start.js';
export { statusCommand } from './commands/status.js';
export { approveCommand } from './commands/approve.js';
export { abortCommand } from './commands/abort.js';
export { migrateCommand } from './commands/migrate.js';
export { configCommand } from './commands/config.js';
export { designCommand } from './commands/design.js';
export { designFigmaCommand } from './commands/design-figma.js';
export { designCollaborateCommand } from './commands/design-collaborate.js';
export { designPenpotCommand } from './commands/design-penpot.js';
export { designPenpotAllCommand } from './commands/design-penpot-all.js';
export { designPenpotBrowserCommand } from './commands/design-penpot-browser.js';
export { doctorCommand } from './commands/doctor.js';
export { setupCommand } from './commands/setup.js';
export { designSystemShowCommand, designSystemUpdateCommand, designSystemValidateCommand, pickComponentLibrary } from './commands/design-system.js';
export { getComponentLibraryPresets, getComponentLibraryById } from './commands/component-library-presets.js';
export type { ComponentLibraryPreset, ComponentLibraryId } from './commands/component-library-presets.js';
export { designGenerateCommand } from './commands/design-generate.js';
export { describeCommand } from './commands/describe.js';
export { designPreviewCommand } from './commands/design-preview.js';
export { designPenpotReviewCommand } from './commands/design-penpot-review.js';
export { designListCommand } from './commands/design-list.js';
export type { DescribeConfig, DescribeAnswers } from './commands/describe.js';
export type { GeneratedAppSpec, GeneratedPage, GeneratedModel, GeneratedEndpoint, DesignGenerateResult } from './commands/design-generate.js';
export type { InitAnswers, InitConfig, DesignArchetype } from './commands/init.js';
export type { ProjectManifest, TaskEntry, TasksFile } from './types.js';
export { formatTaskTable, formatTaskRow } from './formatter.js';
