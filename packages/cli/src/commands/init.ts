/**
 * @module @agentforge/cli/commands/init
 *
 * The `agentforge init` command. Scaffolds a new AgentForge project
 * with an opinionated quick-start wizard (5 questions, under 3 minutes).
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import type { ProjectManifest } from '../types.js';
import { writeYaml, type FileSystem, realFs, loadDotEnv } from '../fs-utils.js';
import { successMsg, infoMsg, errorMsg } from '../formatter.js';
import { renderAllTemplates } from '../template-renderer.js';
import { setupEngine, checkPrerequisites } from '../engine-setup.js';
import { loadBaseCatalog, generateProjectCatalog, saveComponentCatalog, debugLog, scaffoldProject as coreScaffoldProject } from '@agentforge/core';
import { pickComponentLibrary } from './design-system.js';
import { generateDesignOptions } from './generate-design-options.js';
import type { DesignArchetype } from '../design/archetypes.js';
import { writeDesignSystemFiles } from '../design/design-system-writer.js';
import { promptOnce } from '../utils/prompt-once.js';

/**
 * Answers collected from the init wizard.
 */
export interface InitAnswers {
  readonly name: string;
  readonly description: string;
  readonly repo: string;
  readonly slackChannel: string;
  readonly telegramEnabled: boolean;
  readonly designArchetype?: DesignArchetype;
  readonly targetAudience: string;
}

/**
 * Configuration for init command behavior (e.g. in tests).
 */
export interface InitConfig {
  /** Override browser opener. Return true if browser opened. */
  readonly openBrowser?: (url: string) => Promise<boolean>;
  /** When true, skip LLM calls and use built-in archetypes directly. */
  readonly mock?: boolean;
}

// Re-export archetypes — canonical location is ../design/archetypes.js
export { buildDesignTokensSpec, buildBrandSpec } from '../design/archetypes.js';
export type { DesignArchetype } from '../design/archetypes.js';


// Re-export tailwind/CSS generators — canonical location is ../design/tailwind-generator.js
export { generateTailwindConfig, hexToHSLChannels, generateGlobalCss } from '../design/tailwind-generator.js';


/**
 * Prompt the user for a single line of input.
 */
function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Run the interactive init wizard and return collected answers.
 */
// DEVIATION: ADR-019
// PRD v2.0 Section 9.1.1 specifies: interactive CLI wizard with 5 questions
// Implementation: wizard requires TTY; no --non-interactive flag for CI environments
// Rationale: see ADR-019 — non-interactive mode deferred to Phase 2
export async function runWizard(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
  defaultName?: string,
): Promise<InitAnswers> {
  const rl = readline.createInterface({ input, output });

  try {
    output.write('\nWelcome to AgentForge!\n\n');

    const name = await prompt(rl, 'Project name', defaultName);
    const repo = await prompt(rl, 'GitHub org/repo');
    const slackChannel = await prompt(rl, 'Primary Slack channel', '#agentforge');
    const telegramAnswer = await prompt(rl, 'Enable Telegram? (y/n)', 'n');
    const telegramEnabled = telegramAnswer.toLowerCase() !== 'n';

    return { name, description: '', repo, slackChannel, telegramEnabled, targetAudience: '' };
  } finally {
    rl.close();
  }
}

/**
 * Generate a simple project ID from the name.
 */
function generateProjectId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  const suffix = Math.random().toString(36).substring(2, 8);
  return `proj_${slug}_${suffix}`;
}

/**
 * Build the project manifest from wizard answers.
 */
export function buildManifest(answers: InitAnswers): ProjectManifest {
  const [org, repoName] = answers.repo.includes('/')
    ? answers.repo.split('/')
    : ['', answers.repo];

  const channels = [
    { type: 'slack' as const, capabilities: 'full' as const, priority: 1 },
    ...(answers.telegramEnabled
      ? [{ type: 'telegram' as const, capabilities: 'approvals' as const, priority: 2 }]
      : []),
    { type: 'cli' as const, capabilities: 'basic' as const, priority: 3 },
  ];

  debugLog('buildManifest: Hardcoding stack to react/node/postgresql/tailwind');
  debugLog('buildManifest: Hardcoding budget to per_task=$2, per_phase=$25, monthly=$200, alert_threshold=0.8');
  debugLog('buildManifest: Hardcoding HITL default=review_and_override, design=full_approval, production_deploy=full_approval, test_generation=notify_only');
  debugLog('buildManifest: Hardcoding models default=claude-sonnet-4-6, architecture=claude-opus-4-6, code_review=claude-haiku-4-5');
  debugLog('buildManifest: Hardcoding sandbox type=github_actions, timeout=15min, max_retries=3');
  debugLog('buildManifest: Hardcoding design viewport=1440, layout_strategy=desktop-first, responsive_breakpoints=false');
  debugLog('buildManifest: Hardcoding routing approval_requests=all, status_updates=primary, critical_alerts=all');

  return {
    version: '1.0',
    project: {
      name: answers.name,
      id: generateProjectId(answers.name),
      description: answers.description || undefined,
      platforms: ['web'],
    },
    stack: {
      frontend: 'react',
      backend: 'node',
      database: 'postgresql',
      styling: 'tailwind',
    },
    repo: {
      provider: 'github',
      org,
      name: repoName,
    },
    agents: {
      providers: {
        default: 'claude-sonnet-4-6',
        overrides: {
          architecture: 'claude-opus-4-6',
          code_review: 'claude-haiku-4-5',
        },
      },
      sandbox: {
        type: 'github_actions',
        timeout_minutes: 15,
        max_retries: 3,
      },
      orchestration: {
        max_concurrent_agents: 3,
        ci_wait_strategy: 'spawn_next',
      },
    },
    hitl: {
      default: 'review_and_override',
      overrides: {
        design: 'full_approval',
        production_deploy: 'full_approval',
        test_generation: 'notify_only',
      },
    },
    channels,
    routing: {
      approval_requests: 'all',
      status_updates: 'primary',
      critical_alerts: 'all',
    },
    budget: {
      per_task_max_usd: 2.0,
      per_phase_max_usd: 25.0,
      monthly_max_usd: 200.0,
      alert_threshold: 0.8,
    },
    design: {
      primary_viewport: 1440,
      layout_strategy: 'desktop-first' as const,
      responsive_breakpoints: false,
    },
  };
}

/**
 * Default agent definitions for Phase 1.
 *
 * Each agent contract includes all 7 sections required by PRD v2.0 Section 10.1:
 * role, provider, execution, tools, permissions, hitl_policy, budget.
 *
 * DEVIATION: ADR-010
 * PRD v2.0 Section 10.1 specifies: 7-section agent contracts
 * Implementation: previously used 5-field simplified format; now includes all 7 sections
 * Rationale: see ADR-010
 */
function buildAgentsYaml(manifest: ProjectManifest): Record<string, unknown> {
  debugLog('buildAgentsYaml: Hardcoding max_tokens_per_task=50000, execution mode=stream, progress_events=true');

  const defaultBudget = {
    max_tokens_per_task: 50000,
    max_cost_per_task_usd: manifest.budget.per_task_max_usd,
  };

  const defaultExecution = {
    mode: 'stream',
    progress_events: true,
  };

  return {
    version: '1.0',
    agents: [
      {
        role: 'clarifier',
        phase: 'clarify',
        provider: manifest.agents.providers.overrides?.['architecture'] ?? manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['spec.read_project', 'retrieval.search_code', 'retrieval.search_docs', 'retrieval.search_designs', 'retrieval.get_repo_map', 'retrieval.find_similar_patterns'],
        permissions: ['read_spec', 'write_spec', 'read_design', 'read_code'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'full_approval',
        budget: { ...defaultBudget },
        on_complete: 'RequirementsClarified',
        on_error: 'notify_human',
      },
      {
        role: 'ux_researcher',
        phase: 'design',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['figma_mcp.get_code', 'spec.read_project', 'spec.read_pages'],
        permissions: ['read_spec', 'read_design_system', 'read_design'],
        denied: ['write_code', 'deploy', 'merge_pr'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'UXResearchComplete',
        on_error: 'notify_human',
      },
      {
        role: 'wireframer',
        phase: 'design',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['figma_mcp.get_code', 'figma_mcp.generate_figma_design'],
        permissions: ['read_spec', 'write_design', 'read_design_system'],
        denied: ['write_code', 'deploy', 'merge_pr'],
        hitl_policy: 'full_approval',
        budget: { ...defaultBudget },
        on_complete: 'WireframeComplete',
        on_error: 'notify_human',
      },
      {
        role: 'spec_writer',
        phase: 'spec',
        provider: manifest.agents.providers.overrides?.['architecture'] ?? manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['spec.read_project', 'spec.write_spec', 'spec.read_pages'],
        permissions: ['read_spec', 'write_spec', 'read_design'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'SpecComplete',
        on_error: 'notify_human',
      },
      {
        role: 'task_decomposer',
        phase: 'spec',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['spec.read_spec', 'tasks.create_task', 'tasks.read_tasks'],
        permissions: ['read_spec', 'write_tasks'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'TasksCreated',
        on_error: 'notify_human',
      },
      {
        role: 'code_generator',
        phase: 'code',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.write_file', 'code.read_file', 'spec.read_spec', 'git.create_branch', 'git.commit'],
        permissions: ['read_spec', 'write_code', 'create_branch', 'create_pr'],
        denied: ['deploy', 'merge_pr', 'write_design', 'write_spec'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'CodeGenComplete',
        on_error: 'notify_human',
      },
      {
        role: 'test_writer',
        phase: 'code',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.write_file', 'code.read_file', 'spec.read_spec', 'test.run_tests'],
        permissions: ['read_spec', 'read_code', 'write_tests'],
        denied: ['deploy', 'merge_pr', 'write_design', 'write_spec'],
        hitl_policy: 'notify_only',
        budget: { ...defaultBudget },
        on_complete: 'TestsComplete',
        on_error: 'notify_human',
      },
      {
        role: 'code_reviewer',
        phase: 'code',
        provider: manifest.agents.providers.overrides?.['code_review'] ?? manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.read_file', 'git.read_diff', 'spec.read_spec'],
        permissions: ['read_code', 'read_spec', 'write_review'],
        denied: ['write_code', 'deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'ReviewComplete',
        on_error: 'notify_human',
      },
      {
        role: 'implementer',
        phase: 'code',
        provider: manifest.agents.providers.default,
        execution: { ...defaultExecution },
        tools: ['code.read_file', 'code.write_file', 'code.apply_patch', 'code.run_typecheck', 'code.run_tests', 'code.run_lint', 'code.report_assumption_violation'],
        permissions: ['read_spec', 'read_code', 'write_code', 'create_branch'],
        denied: ['deploy', 'merge_pr', 'write_design'],
        hitl_policy: 'review_and_override',
        budget: { ...defaultBudget },
        on_complete: 'ImplementerTaskComplete',
        on_error: 'notify_human',
      },
    ],
  };
}

/**
 * Scaffold CLI-specific project files that are NOT part of the shared
 * core scaffoldProject. Called after coreScaffoldProject completes.
 *
 * CLI-specific files: .agentforge/ dirs, trust-state, agent contracts,
 * tasks file, app source dirs, scaffold templates.
 */
export function scaffoldCliExtras(
  rootDir: string,
  manifest: ProjectManifest,
  fileSystem: FileSystem = realFs,
  templateContents?: Map<string, string>,
): string[] {
  const created: string[] = [];

  // .agentforge internal directories
  fileSystem.mkdir(path.join(rootDir, '.agentforge', 'learnings'));
  created.push('.agentforge/learnings/');

  fileSystem.mkdir(path.join(rootDir, '.agentforge', 'audit'));
  created.push('.agentforge/audit/');

  fileSystem.mkdir(path.join(rootDir, '.agentforge', 'locks'));
  created.push('.agentforge/locks/');

  // Write initial trust state
  writeYaml(path.join(rootDir, '.agentforge', 'trust-state.yaml'), { version: '1.0', trust: {} }, fileSystem);
  created.push('.agentforge/trust-state.yaml');

  // Create app directories
  const appDirs = ['src/components', 'src/pages', 'src/api', 'src/lib', 'prisma'];
  for (const dir of appDirs) {
    fileSystem.mkdir(path.join(rootDir, dir));
    created.push(`${dir}/`);
  }

  // Write empty tasks file
  writeYaml(path.join(rootDir, 'agentforge.tasks.yaml'), { tasks: [] }, fileSystem);
  created.push('agentforge.tasks.yaml');

  // DEVIATION: ADR-011
  writeYaml(path.join(rootDir, 'agentforge', 'agents.yaml'), buildAgentsYaml(manifest), fileSystem);
  created.push('agentforge/agents.yaml');

  // Render and write scaffold templates
  const vars = { PROJECT_NAME: manifest.project.name };
  const templates = templateContents ?? renderAllTemplates(vars);
  for (const [outputPath, content] of templates) {
    const fullPath = path.join(rootDir, outputPath);
    const dir = path.dirname(fullPath);
    fileSystem.mkdir(dir);
    fileSystem.writeFile(fullPath, content);
    created.push(outputPath);
  }

  return created;
}

/**
 * Backward-compatible wrapper: calls core's scaffoldProject then
 * scaffoldCliExtras. Existing tests that call scaffoldProject(rootDir,
 * manifest, fs, templates) continue working without modification.
 */
export function scaffoldProject(
  rootDir: string,
  manifest: ProjectManifest,
  fileSystem: FileSystem = realFs,
  templateContents?: Map<string, string>,
): string[] {
  const coreResult = coreScaffoldProject(
    {
      name: manifest.project.name,
      description: manifest.project.description,
      projectConfig: manifest as unknown as Record<string, unknown>,
    },
    rootDir,
    fileSystem,
  );

  if (!coreResult.ok) {
    throw new Error(coreResult.error.message);
  }

  const cliFiles = scaffoldCliExtras(rootDir, manifest, fileSystem, templateContents);
  return [...coreResult.value.createdFiles, ...cliFiles];
}


/**
 * Execute the full init command.
 */
export async function initCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
  _config?: InitConfig,
): Promise<void> {
  const out = output ?? process.stdout;

  // Create target directory if it doesn't exist
  if (!fileSystem.exists(rootDir)) {
    fileSystem.mkdir(rootDir);
  }

  // Guard: prevent initializing inside the AgentForge monorepo itself
  const monorepoMarkers = ['nx.json', 'packages'];
  const isMonorepo = monorepoMarkers.every((marker) =>
    fileSystem.exists(path.join(rootDir, marker)),
  );
  if (isMonorepo) {
    out.write(errorMsg('This looks like the AgentForge monorepo, not a user project.\n'));
    out.write(infoMsg('  Create a project in a separate directory:\n'));
    out.write(infoMsg('    agentforge init ./my-app\n'));
    out.write(infoMsg('    agentforge init /path/to/my-app\n'));
    process.exitCode = 1;
    return;
  }

  // Check if already initialized
  if (fileSystem.exists(path.join(rootDir, 'agentforge.yaml'))) {
    out.write(errorMsg(`${rootDir} already has an agentforge.yaml. Aborting.\n`));
    process.exitCode = 1;
    return;
  }

  // Derive a human-friendly default name from the directory name
  // e.g. "foodie-app" → "Foodie App"
  const dirName = path.basename(rootDir);
  const defaultName = dirName
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const answers = await runWizard(input, output, defaultName);
  const manifest = buildManifest(answers);

  scaffoldProject(rootDir, manifest, fileSystem);

  // DEVIATION: ADR-005
  // PRD v2.0 Section 9.1.1 specifies: "Connecting Slack... done" / "Connecting Telegram... done"
  // Implementation: init records channel preferences only, does not connect
  // Rationale: see ADR-005 — tokens require env vars, connection deferred to `start` command
  out.write('\n');
  out.write(successMsg('✓ Project scaffolded\n'));
  out.write(successMsg('✓ Agent definitions created\n\n'));
  if (answers.slackChannel) {
    out.write(infoMsg(`  Slack channel configured: ${answers.slackChannel}\n`));
  }
  if (answers.telegramEnabled) {
    out.write(infoMsg('  Telegram channel configured\n'));
  }

  // Load .env from the directory where the CLI was invoked so that API keys
  // (e.g. ANTHROPIC_API_KEY) are available for LLM-powered design theme
  // generation later in init. Also copy it into the new project directory.
  const callerDir = process.cwd();
  loadDotEnv(callerDir);

  const callerEnvPath = path.join(callerDir, '.env');
  const targetEnvPath = path.join(rootDir, '.env');
  if (fileSystem.exists(callerEnvPath) && !fileSystem.exists(targetEnvPath)) {
    const envContent = fileSystem.readFile(callerEnvPath);
    if (envContent.ok) {
      fileSystem.writeFile(targetEnvPath, envContent.value);
      out.write(infoMsg(`  .env copied from parent directory ${callerDir}\n`));
    }
  }

  // Design system setup — two independent steps:
  //   1. Component library (code architecture)
  //   2. Visual theme (LLM-generated colors/fonts/brand)
  const inp = input ?? process.stdin;
  out.write(infoMsg('\n--- Design System ---\n'));
  out.write(infoMsg('Set up your design system now?\n'));
  out.write(infoMsg('  1. Yes — pick component library + generate theme (default)\n'));
  out.write(infoMsg('  2. Skip for now, I will use my own design system\n'));

  let designPathChoice: number | undefined;
  while (designPathChoice === undefined) {
    const answer = await promptOnce(inp, out, '\nChoose 1 or 2 (Enter = 1): ');
    if (answer === '') {
      designPathChoice = 1;
    } else {
      const num = parseInt(answer, 10);
      if (num === 1 || num === 2) {
        designPathChoice = num;
      } else {
        out.write(infoMsg('Please enter 1, 2, or press Enter for 1 (yes).\n'));
      }
    }
  }

  if (designPathChoice === 1) {
    // Step 1: Component library
    const selectedLibrary = await pickComponentLibrary(rootDir, inp, out, fileSystem);

    // Step 2: Visual theme (LLM or fallback archetypes)
    out.write(infoMsg('\nNow let\'s pick your visual theme...\n'));
    const designResult = await generateDesignOptions(
      { appName: answers.name, description: answers.description, targetAudience: answers.targetAudience || 'general' },
      inp,
      out,
      { openBrowser: _config?.openBrowser, mock: _config?.mock, rootDir, fileSystem },
    );
    writeDesignSystemFiles(rootDir, designResult.tokens, designResult.brand, fileSystem);

    // Step 3: Generate project-specific component catalog
    const baseCatalog = loadBaseCatalog();
    const projectCatalog = generateProjectCatalog(baseCatalog, selectedLibrary.id, designResult.tokens);
    saveComponentCatalog(rootDir, projectCatalog, fileSystem);
    out.write(successMsg('✓ Component catalog generated\n'));

    out.write(successMsg('✓ Design system configured\n'));
  } else {
    out.write(infoMsg('Skipped. Run `agentforge design-system update` later to configure.\n'));
  }

  // Show cd hint when project was created in a subdirectory
  const cwd = process.cwd();
  const isSubdir = path.resolve(rootDir) !== path.resolve(cwd);
  const relPath = isSubdir ? path.relative(cwd, rootDir) : '';

  out.write('\n');
  out.write(successMsg('Next steps:\n'));
  if (relPath) {
    out.write(infoMsg(`  cd ${relPath}\n`));
  }
  out.write(infoMsg('  1. Describe your app:    agentforge describe\n'));
  out.write(infoMsg('  2. Set up env vars:      see .env.example\n'));
  out.write(infoMsg('  3. Verify integrations:  agentforge doctor\n'));
  out.write('\n');

  // Offer optional engine setup
  const engineStatus = checkPrerequisites(rootDir);
  if (!engineStatus.ready) {
    const rl = readline.createInterface({ input: input ?? process.stdin, output: out });
    const setupAnswer = await prompt(rl, '\nSet up the Python orchestration engine now? (y/n)', 'y');
    rl.close();

    if (setupAnswer.toLowerCase() !== 'n') {
      out.write(infoMsg('\nSetting up engine...\n'));
      const result = await setupEngine(rootDir, (msg) => {
        out.write(infoMsg(`${msg}\n`));
      });
      if (result.ok) {
        out.write(successMsg('✓ Engine ready.\n\n'));
      } else {
        out.write(errorMsg(`Engine setup failed: ${result.error.message}\n`));
        out.write(infoMsg('You can retry later with: agentforge setup\n\n'));
      }
    }
  }
}
