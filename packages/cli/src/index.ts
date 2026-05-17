/**
 * @module @agentforge/cli
 *
 * AgentForge CLI — Commander.js program with all SDLC commands.
 * Entry point for the `agentforge` binary.
 */

import * as path from 'node:path';
import { Command } from 'commander';
import { findProjectRoot, realFs, loadDotEnv } from './fs-utils.js';
import { initCommand } from './commands/init.js';
import { startCommand } from './commands/start.js';
import { statusCommand } from './commands/status.js';
import { approveCommand } from './commands/approve.js';
import { abortCommand } from './commands/abort.js';
import { migrateCommand } from './commands/migrate.js';
import { configCommand } from './commands/config.js';
import { designCommand } from './commands/design.js';
import { designPageCommand } from './commands/design-page.js';
import { designPageAllCommand } from './commands/design-page-all.js';
import { designPageBrowserCommand } from './commands/design-page-browser.js';
import { doctorCommand } from './commands/doctor.js';
import { setupCommand } from './commands/setup.js';
import {
  designSystemShowCommand,
  designSystemUpdateCommand,
  designSystemValidateCommand,
  designSystemRegenerateCatalogCommand,
} from './commands/design-system.js';
import { designGenerateCommand } from './commands/design-generate.js';
import { describeCommand } from './commands/describe.js';
import { designPreviewCommand } from './commands/design-preview.js';
import { designPageReviewCommand } from './commands/design-page-review.js';
import { designListCommand } from './commands/design-list.js';
import { evalCommand } from './commands/eval.js';
import { spineImplementCommand } from './commands/spine-implement-task.js';

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
    .option('--mock', 'Skip LLM calls and use built-in design archetypes (for testing)')
    .action(async (directory: string | undefined, opts: { mock?: boolean }) => {
      const rootDir = directory
        ? path.resolve(process.cwd(), directory)
        : process.cwd();
      loadDotEnv(rootDir);
      await initCommand(rootDir, realFs, undefined, undefined, opts.mock ? { mock: true } : undefined);
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
    .command('design:page')
    .description('Create a design page via the UX agent pipeline (Research -> Planning -> Design)')
    .argument('<pageId>', 'Page ID from pages.yaml (e.g., "bill-entry") or page name')
    .option('--tool <tool>', 'Design tool: browser (default) or penpot', 'browser')
    .option('--stage <stage>', 'Skip to a stage: research, planning, design, replay, replay-browser, connect')
    .option('--module <id>', 'Module ID override (default: page ID from pages.yaml)')
    .option('--width <pixels>', 'Viewport width in pixels (default: 1440)')
    .option('--no-wait', 'Exit after design without waiting for approval')
    .option('--implement', 'Skip feedback loop and generate code directly after design')
    .option('--mock', 'Use mock MCP (no design tool connection)')
    .option('--project-dir <dir>', 'Project directory for artifact path resolution (default: cwd)')
    .option('--designspec-v1', 'Use V1 LLM-based script generation (legacy; default is V2 deterministic renderer)')
    .option('--fresh', 'Force re-run all stages, ignoring cached research/planning artifacts')
    .option('--evaluate', 'Run non-interactive design evaluation (for CI/CD). Exit code 1 if score < threshold')
    .option('--evaluate-threshold <score>', 'Minimum score (0-100) for --evaluate pass (default: 75)')
    .option('--export-penpot', 'Export to Penpot after browser correction (default: prompt user)')
    .option('--no-export-penpot', 'Skip Penpot export entirely')
    .option('--penpot-correction', 'Use legacy Penpot-based correction instead of browser correction')
    .option('--interactive', 'Force interactive browser correction')
    .option('--no-interactive', 'Force non-interactive browser correction')
    .action(async (pageId: string, options: { tool?: string; stage?: string; module?: string; width?: string; wait?: boolean; implement?: boolean; mock?: boolean; projectDir?: string; designspecV1?: boolean; fresh?: boolean; evaluate?: boolean; evaluateThreshold?: string; exportPenpot?: boolean; penpotCorrection?: boolean; interactive?: boolean }) => {
      await designPageCommand(pageId, process.stdout, {
        tool: (options.tool as 'browser' | 'penpot') ?? 'browser',
        stage: options.stage as 'research' | 'planning' | 'design' | 'replay' | 'replay-browser' | 'connect' | undefined,
        module: options.module,
        width: options.width ? parseInt(options.width, 10) : undefined,
        noWait: options.wait === false,
        implement: options.implement,
        mock: options.mock,
        projectDir: options.projectDir,
        designspecV1: options.designspecV1,
        fresh: options.fresh,
        evaluate: options.evaluate,
        evaluateThreshold: options.evaluateThreshold ? parseInt(options.evaluateThreshold, 10) : undefined,
        exportPenpot: options.exportPenpot,
        penpotCorrection: options.penpotCorrection,
        interactive: options.interactive,
      });
    });

  program
    .command('design:page:all')
    .description('Design all screens from pages.yaml (reads project spec automatically)')
    .option('--tool <tool>', 'Design tool: browser (default) or penpot', 'browser')
    .option('--pages <ids>', 'Only design specific pages (comma-separated IDs, e.g. "home,book-detail")')
    .option('--width <pixels>', 'Viewport width in pixels — overrides per-page viewports (default: 1440)')
    .option('--design-only', 'Skip research+planning, use cached artifacts')
    .action(async (options: { tool?: string; pages?: string; width?: string; designOnly?: boolean }) => {
      await designPageAllCommand(process.stdout, {
        ...options,
        tool: (options.tool as 'browser' | 'penpot') ?? 'browser',
        width: options.width ? parseInt(options.width, 10) : undefined,
      });
    });

  program
    .command('design:page:browser')
    .description('Create a design page with Playwright browser automation (screenshots + state reading)')
    .argument('<description>', 'Natural language description of what to design')
    .option('--stage <stage>', 'Skip to a stage: research, planning, design (loads prior from cache)')
    .option('--module <id>', 'Module ID (default: derived from description)')
    .option('--width <pixels>', 'Viewport width in pixels (default: 1440)')
    .option('--headless', 'Run browser headless (default: headed)')
    .option('--no-wait', 'Exit after design without waiting for approval')
    .option('--implement', 'Skip feedback loop and generate code directly after design')
    .option('--mock', 'Use mock MCP (no design tool connection)')
    .action(async (description: string, options: { stage?: string; module?: string; width?: string; headless?: boolean; wait?: boolean; implement?: boolean; mock?: boolean }) => {
      await designPageBrowserCommand(description, process.stdout, {
        stage: options.stage as 'research' | 'planning' | 'design' | undefined,
        module: options.module,
        width: options.width ? parseInt(options.width, 10) : undefined,
        headless: options.headless ?? false,
        noWait: options.wait === false,
        implement: options.implement,
        mock: options.mock,
      });
    });

  program
    .command('design:page:review')
    .description('Review and interactively improve an existing design page via browser agent')
    .requiredOption('--url <url>', 'Penpot workspace URL (user must be logged in)')
    .option('--page <id>', 'Page ID from pages.yaml to focus evaluation on')
    .option('--headless', 'Run browser headless')
    .action(async (options: { url: string; page?: string; headless?: boolean }) => {
      await designPageReviewCommand(process.stdout, options);
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
    .option('--mock', 'Skip LLM calls and use built-in design archetypes (for testing)')
    .action(async (opts: { mock?: boolean }) => {
      const rootDir = findProjectRoot();
      loadDotEnv(rootDir);
      await designSystemUpdateCommand(rootDir, realFs, process.stdin, process.stdout, opts.mock ? { mock: true } : undefined);
    });

  designSystem
    .command('validate')
    .description('Validate design-tokens.yaml and brand.yaml for internal consistency')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designSystemValidateCommand(rootDir, realFs, process.stdout);
    });

  designSystem
    .command('regenerate-catalog')
    .description('Regenerate the component catalog from the base catalog')
    .action(async () => {
      const rootDir = findProjectRoot();
      await designSystemRegenerateCatalogCommand(rootDir, realFs, process.stdout);
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

  program
    .command('eval')
    .description('Run Clarifier evaluation harness')
    .argument('[target]', 'Eval target (clarifier)', 'clarifier')
    .option('--scenario <id>', 'Run a single scenario by ID')
    .option('--baseline', 'Promote current run to baseline')
    .option('--record', 'Record LLM calls to cassette for replay')
    .option('--replay', 'Replay from recorded cassettes')
    .option('--output <format>', 'Output format: text or json', 'text')
    .option('--threshold <pct>', 'Regression threshold percentage', '20')
    .option('--cassette-dir <path>', 'Directory for cassette files')
    .action(async (_target: string, opts: {
      scenario?: string;
      baseline?: boolean;
      record?: boolean;
      replay?: boolean;
      output?: string;
      threshold?: string;
      cassetteDir?: string;
    }) => {
      const rootDir = findProjectRoot();
      loadDotEnv(rootDir);
      await evalCommand({
        scenario: opts.scenario,
        baseline: opts.baseline,
        record: opts.record,
        replay: opts.replay,
        output: (opts.output as 'text' | 'json') ?? 'text',
        threshold: opts.threshold,
        cassetteDir: opts.cassetteDir,
      }, rootDir);
    });

  program
    .command('spine:implement')
    .description('Run the Implementer on a task from the Architect\'s task plan')
    .option('--task-id <id>', 'Task ID to implement')
    .option('--provider <name>', 'LLM provider model', 'claude-opus-4-6')
    .option('--task-plan <path>', 'Path to task plan YAML (default: .agentforge/architect/task-plan.yaml)')
    .option('--skip-review', 'Skip the Reviewer step after implementation')
    .action(async (options: { taskId?: string; provider?: string; taskPlan?: string; skipReview?: boolean }) => {
      const rootDir = findProjectRoot();
      loadDotEnv(rootDir);
      await spineImplementCommand(rootDir, {
        taskId: options.taskId,
        provider: options.provider,
        taskPlanPath: options.taskPlan,
        skipReview: options.skipReview,
      });
    });

  return program;
}

export { initCommand, buildManifest, scaffoldProject, scaffoldCliExtras } from './commands/init.js';
export { buildDesignTokensSpec, buildBrandSpec } from './design/archetypes.js';
export { generateTailwindConfig, generateGlobalCss, hexToHSLChannels } from './design/tailwind-generator.js';
export { startCommand } from './commands/start.js';
export { statusCommand } from './commands/status.js';
export { approveCommand } from './commands/approve.js';
export { abortCommand } from './commands/abort.js';
export { migrateCommand } from './commands/migrate.js';
export { configCommand } from './commands/config.js';
export { designCommand } from './commands/design.js';
export { ensureDesignToolConnection, createNoOpMCPClient, PENPOT_SETUP_INSTRUCTIONS } from './commands/design-preflight.js';
export type { DesignTool, PreflightResult } from './commands/design-preflight.js';
export { designPageCommand } from './commands/design-page.js';
export { designPageAllCommand } from './commands/design-page-all.js';
export type { DesignPageAllOptions } from './commands/design-page-all.js';
export { designPageBrowserCommand } from './commands/design-page-browser.js';
export { doctorCommand } from './commands/doctor.js';
export { setupCommand } from './commands/setup.js';
export { designSystemShowCommand, designSystemUpdateCommand, designSystemValidateCommand, designSystemRegenerateCatalogCommand, pickComponentLibrary } from './commands/design-system.js';
export { getComponentLibraryPresets, getComponentLibraryById } from './commands/component-library-presets.js';
export type { ComponentLibraryPreset, ComponentLibraryId } from './commands/component-library-presets.js';
export { designGenerateCommand } from './commands/design-generate.js';
export { describeCommand } from './commands/describe.js';
export { designPreviewCommand } from './commands/design-preview.js';
export { designPageReviewCommand } from './commands/design-page-review.js';
export { designListCommand } from './commands/design-list.js';
export type { DescribeConfig, DescribeAnswers } from './commands/describe.js';
export type { GeneratedAppSpec, GeneratedPage, GeneratedModel, GeneratedEndpoint, DesignGenerateResult } from './commands/design-generate.js';
export { generatePreviewHtml, buildFallbackOptions, optionToTokens, optionToBrand } from './commands/generate-design-options.js';
export type { DesignOption, GenerateDesignResult } from './commands/generate-design-options.js';
export type { InitAnswers, InitConfig } from './commands/init.js';
export type { DesignArchetype } from './design/archetypes.js';
export type { ProjectManifest, TaskEntry, TasksFile } from './types.js';
export { formatTaskTable, formatTaskRow, debugMsg } from './formatter.js';
