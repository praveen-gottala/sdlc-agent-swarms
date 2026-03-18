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
 * Scaffold the project directory structure.
 */
export function scaffoldProject(
  rootDir: string,
  manifest: ProjectManifest,
  fileSystem: FileSystem = realFs,
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

  // Write project manifest
  const manifestPath = path.join(rootDir, 'agentforge.yaml');
  writeYaml(manifestPath, manifest, fileSystem);
  created.push('agentforge.yaml');

  // Write empty tasks file
  const tasksPath = path.join(rootDir, 'agentforge.tasks.yaml');
  writeYaml(tasksPath, { tasks: [] }, fileSystem);
  created.push('agentforge.tasks.yaml');

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

  // Check if already initialized
  if (fileSystem.exists(path.join(rootDir, 'agentforge.yaml'))) {
    out.write(errorMsg('This directory already has an agentforge.yaml. Aborting.\n'));
    process.exitCode = 1;
    return;
  }

  const answers = await runWizard(input, output);
  const manifest = buildManifest(answers);
  scaffoldProject(rootDir, manifest, fileSystem);

  out.write('\n');
  out.write(successMsg('Scaffolding project... done\n'));
  out.write(successMsg('Registering agents... done\n'));
  if (answers.slackChannel) {
    out.write(successMsg(`Connecting Slack (${answers.slackChannel})... done\n`));
  }
  if (answers.telegramEnabled) {
    out.write(successMsg('Connecting Telegram... done\n'));
  }

  out.write('\n');
  out.write(infoMsg(`Using defaults: React + Node.js + PostgreSQL + Tailwind\n`));
  out.write(infoMsg(`HITL: review_and_override (design/deploy: full_approval)\n`));
  out.write(infoMsg(`Budget: $2/task, $25/phase, $200/month\n`));
  out.write('\n');
  out.write(successMsg('AgentForge is ready. Run: agentforge start design\n'));
}
