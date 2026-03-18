/**
 * @module @agentforge/cli/commands/init
 *
 * The `agentforge init` command. Scaffolds a new AgentForge project
 * with an opinionated quick-start wizard (5 questions, under 3 minutes).
 */

import * as path from 'node:path';
import * as readline from 'node:readline';
import type { ProjectManifest } from '../types.js';
import { writeYaml, type FileSystem, realFs } from '../fs-utils.js';
import { successMsg, infoMsg, errorMsg } from '../formatter.js';
import { renderAllTemplates } from '../template-renderer.js';

/**
 * Answers collected from the init wizard.
 */
export interface InitAnswers {
  readonly name: string;
  readonly description: string;
  readonly repo: string;
  readonly slackChannel: string;
  readonly telegramEnabled: boolean;
}

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
export async function runWizard(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<InitAnswers> {
  const rl = readline.createInterface({ input, output });

  try {
    output.write('\nWelcome to AgentForge!\n\n');

    const name = await prompt(rl, 'Project name');
    const description = await prompt(rl, 'Description');
    const repo = await prompt(rl, 'GitHub org/repo');
    const slackChannel = await prompt(rl, 'Primary Slack channel', '#agentforge');
    const telegramAnswer = await prompt(rl, 'Enable Telegram? (y/n)', 'y');
    const telegramEnabled = telegramAnswer.toLowerCase() !== 'n';

    return { name, description, repo, slackChannel, telegramEnabled };
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
        default: 'claude-sonnet-4',
        overrides: {
          architecture: 'claude-opus-4',
          code_review: 'claude-haiku-4',
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
  };
}

/**
 * Default agent definitions for Phase 1.
 */
function buildAgentsYaml(manifest: ProjectManifest): Record<string, unknown> {
  return {
    version: '1.0',
    agents: [
      {
        role: 'ux_researcher',
        phase: 'design',
        provider: manifest.agents.providers.default,
        hitl_level: 'notify_only',
        on_complete: 'UXResearchComplete',
      },
      {
        role: 'wireframer',
        phase: 'design',
        provider: manifest.agents.providers.default,
        hitl_level: 'full_approval',
        on_complete: 'WireframeComplete',
      },
      {
        role: 'spec_writer',
        phase: 'spec',
        provider: manifest.agents.providers.overrides?.['architecture'] ?? manifest.agents.providers.default,
        hitl_level: 'review_and_override',
        on_complete: 'SpecComplete',
      },
      {
        role: 'task_decomposer',
        phase: 'spec',
        provider: manifest.agents.providers.default,
        hitl_level: 'notify_only',
        on_complete: 'TasksCreated',
      },
      {
        role: 'code_generator',
        phase: 'code',
        provider: manifest.agents.providers.default,
        hitl_level: 'review_and_override',
        on_complete: 'CodeGenComplete',
      },
      {
        role: 'test_writer',
        phase: 'code',
        provider: manifest.agents.providers.default,
        hitl_level: 'notify_only',
        on_complete: 'TestsComplete',
      },
      {
        role: 'code_reviewer',
        phase: 'code',
        provider: manifest.agents.providers.overrides?.['code_review'] ?? manifest.agents.providers.default,
        hitl_level: 'review_and_override',
        on_complete: 'ReviewComplete',
      },
    ],
  };
}

/**
 * Scaffold the project directory structure.
 */
export function scaffoldProject(
  rootDir: string,
  manifest: ProjectManifest,
  fileSystem: FileSystem = realFs,
  templateContents?: Map<string, string>,
): string[] {
  const created: string[] = [];

  // Create spec directory structure
  const specDir = path.join(rootDir, 'agentforge', 'spec');
  const componentsDir = path.join(specDir, 'components');
  fileSystem.mkdir(componentsDir);
  created.push('agentforge/spec/components/');

  // Create learnings directory
  const learningsDir = path.join(rootDir, '.agentforge', 'learnings');
  fileSystem.mkdir(learningsDir);
  created.push('.agentforge/learnings/');

  // Create audit directory
  const auditDir = path.join(rootDir, '.agentforge', 'audit');
  fileSystem.mkdir(auditDir);
  created.push('.agentforge/audit/');

  // Create locks directory
  const locksDir = path.join(rootDir, '.agentforge', 'locks');
  fileSystem.mkdir(locksDir);
  created.push('.agentforge/locks/');

  // Write initial trust state
  const trustStatePath = path.join(rootDir, '.agentforge', 'trust-state.yaml');
  writeYaml(trustStatePath, { version: '1.0', trust: {} }, fileSystem);
  created.push('.agentforge/trust-state.yaml');

  // Create app directories
  const appDirs = [
    'src/components',
    'src/pages',
    'src/api',
    'src/lib',
    'prisma',
  ];
  for (const dir of appDirs) {
    fileSystem.mkdir(path.join(rootDir, dir));
    created.push(`${dir}/`);
  }

  // Write project manifest
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  writeYaml(manifestPath, manifest, fileSystem);
  created.push('agentforge.yaml');

  // Write empty tasks file
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  writeYaml(tasksPath, { tasks: [] }, fileSystem);
  created.push('agentforge.tasks.yaml');

  // Write agent definitions
  const agentsPath = path.join(rootDir, 'agentforge', 'agents.yaml');
  writeYaml(agentsPath, buildAgentsYaml(manifest), fileSystem);
  created.push('agentforge/agents.yaml');

  // Write seed spec files
  const projectSpec = {
    version: '1.0',
    app: {
      name: manifest.project.name,
      description: manifest.project.description || '',
    },
    adrs: [],
  };
  writeYaml(path.join(specDir, 'project.yaml'), projectSpec, fileSystem);
  created.push('agentforge/spec/project.yaml');

  writeYaml(path.join(specDir, 'pages.yaml'), { version: '1.0', pages: [] }, fileSystem);
  created.push('agentforge/spec/pages.yaml');

  writeYaml(path.join(specDir, 'api.yaml'), { version: '1.0', base_url: '/api', endpoints: [] }, fileSystem);
  created.push('agentforge/spec/api.yaml');

  writeYaml(path.join(specDir, 'models.yaml'), { version: '1.0', models: [] }, fileSystem);
  created.push('agentforge/spec/models.yaml');

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
 * Execute the full init command.
 */
export async function initCommand(
  rootDir: string,
  fileSystem: FileSystem = realFs,
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
): Promise<void> {
  const out = output ?? process.stdout;

  // Create target directory if it doesn't exist
  if (!fileSystem.exists(rootDir)) {
    fileSystem.mkdir(rootDir);
  }

  // Check if already initialized
  if (fileSystem.exists(path.join(rootDir, 'agentforge.yaml'))) {
    out.write(errorMsg(`${rootDir} already has an agentforge.yaml. Aborting.\n`));
    process.exitCode = 1;
    return;
  }

  const answers = await runWizard(input, output);
  const manifest = buildManifest(answers);
  scaffoldProject(rootDir, manifest, fileSystem);

  // ADR-005: Channel setup deferred to runtime via env vars
  // Init only records channel preferences, actual connection happens in `start` command
  out.write('\n');
  out.write(successMsg('✓ Project scaffolded\n'));
  out.write(successMsg('✓ Agent definitions created\n'));
  if (answers.slackChannel) {
    out.write(infoMsg(`  Slack channel configured: ${answers.slackChannel}\n`));
  }
  if (answers.telegramEnabled) {
    out.write(infoMsg('  Telegram channel configured\n'));
  }

  out.write('\n');
  out.write(infoMsg('Stack: React + Node.js + PostgreSQL + Tailwind\n'));
  out.write(infoMsg(`HITL: ${manifest.hitl.default} (design/deploy: full_approval)\n`));
  out.write(infoMsg(`Budget: $${manifest.budget.per_task_max_usd}/task, $${manifest.budget.per_phase_max_usd}/phase, $${manifest.budget.monthly_max_usd}/month\n`));
  out.write('\n');

  // Next steps based on enabled channels
  out.write(successMsg('Next steps:\n'));
  out.write('\n');
  out.write(infoMsg('1. Set up environment variables (see .env.example):\n'));
  if (answers.slackChannel) {
    out.write(infoMsg('   export AGENTFORGE_SLACK_BOT_TOKEN=xoxb-...\n'));
    out.write(infoMsg('   export AGENTFORGE_SLACK_APP_TOKEN=xapp-...\n'));
  }
  if (answers.telegramEnabled) {
    out.write(infoMsg('   export AGENTFORGE_TELEGRAM_BOT_TOKEN=123456:ABC...\n'));
  }
  out.write('\n');
  out.write(infoMsg('2. Configure your LLM provider API key:\n'));
  out.write(infoMsg('   export ANTHROPIC_API_KEY=sk-ant-...\n'));
  out.write('\n');
  out.write(infoMsg('3. Verify your integrations:\n'));
  out.write(infoMsg('   agentforge doctor\n'));
  out.write('\n');
  out.write(infoMsg('4. Start the design phase:\n'));
  out.write(infoMsg('   agentforge start design\n'));
  out.write('\n');
  out.write(infoMsg('Note: Figma not configured. Using code-first design mode.\n'));
}
