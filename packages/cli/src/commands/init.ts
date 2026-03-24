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
import { setupEngine, checkPrerequisites } from '../engine-setup.js';
import type { DesignTokensSpec, BrandSpec } from '@agentforge/core';
import { saveDesignTokens, saveBrandSpec } from '@agentforge/core';
import { pickComponentLibrary } from './design-system.js';
import { generateDesignOptions } from './generate-design-options.js';
import { promptOnce } from './generate-design-options.js';

/** Design archetype choice for project visual identity. */
export type DesignArchetype = 'warm' | 'professional' | 'bold';

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
}

/** Shared layout tokens across all archetypes. */
const SHARED_LAYOUT = {
  spacing: { unit: 8, scale: [4, 8, 12, 16, 24, 32, 48, 64] as readonly number[] },
  borders: { radius: { small: 8, medium: 12, large: 16, pill: 9999 } },
  touch_targets: { minimum_height: 44, minimum_width: 44 },
} as const;

/** Build DesignTokensSpec from archetype choice. */
export function buildDesignTokensSpec(archetype: DesignArchetype): DesignTokensSpec {
  const archetypes: Record<DesignArchetype, Pick<DesignTokensSpec, 'colors' | 'typography' | 'components'>> = {
    warm: {
      colors: {
        primitive: {
          'warm-cream': '#FFF8E7',
          'deep-teal': '#0F6E56',
          'coral-accent': '#E8593C',
          'warm-gray': '#444441',
          'soft-white': '#FAFAF8',
        },
        semantic: {
          'background-primary': 'warm-cream',
          'text-primary': 'warm-gray',
          'cta-primary': 'deep-teal',
          error: 'coral-accent',
        },
      },
      typography: {
        font_families: { display: 'Nunito', body: 'Open Sans' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display' },
          { role: 'heading-2', size: 24, weight: 700, family: 'display' },
          { role: 'heading-3', size: 18, weight: 600, family: 'display' },
          { role: 'body', size: 14, weight: 400, family: 'body' },
          { role: 'label', size: 12, weight: 500, family: 'body' },
          { role: 'small', size: 11, weight: 400, family: 'body' },
        ],
      },
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'warm-gray', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'soft-white', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'soft-white', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'warm-gray', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'deep-teal', text: 'background-primary', radius: 'pill' },
          warning: { bg: 'warm-cream', text: 'text-primary', radius: 'pill' },
          error: { bg: 'error', text: 'background-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'warm-gray', border_width: 2 } },
        progress_bar: {
          track: { bg: 'soft-white', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
      },
    },
    professional: {
      colors: {
        primitive: {
          white: '#FFFFFF',
          slate: '#334155',
          'blue-accent': '#2563EB',
          'light-gray': '#F1F5F9',
          'dark-gray': '#1E293B',
        },
        semantic: {
          'background-primary': 'white',
          'text-primary': 'dark-gray',
          'cta-primary': 'blue-accent',
          error: '#DC2626',
        },
      },
      typography: {
        font_families: { display: 'DM Sans', body: 'Inter' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display' },
          { role: 'heading-2', size: 24, weight: 700, family: 'display' },
          { role: 'heading-3', size: 18, weight: 600, family: 'display' },
          { role: 'body', size: 14, weight: 400, family: 'body' },
          { role: 'label', size: 12, weight: 500, family: 'body' },
          { role: 'small', size: 11, weight: 400, family: 'body' },
        ],
      },
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'slate', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'light-gray', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'light-gray', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'light-gray', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'light-gray', text: 'text-primary', radius: 'pill' },
          warning: { bg: 'light-gray', text: 'dark-gray', radius: 'pill' },
          error: { bg: 'error', text: 'background-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'background-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'light-gray', border_width: 2 } },
        progress_bar: {
          track: { bg: 'light-gray', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
      },
    },
    bold: {
      colors: {
        primitive: {
          'near-black': '#0A0A0A',
          'electric-violet': '#7C3AED',
          'lime-accent': '#84CC16',
          zinc: '#3F3F46',
          'off-white': '#FAFAFA',
        },
        semantic: {
          'background-primary': 'near-black',
          'text-primary': 'off-white',
          'cta-primary': 'electric-violet',
          error: '#EF4444',
        },
      },
      typography: {
        font_families: { display: 'Space Grotesk', body: 'IBM Plex Sans' },
        scale: [
          { role: 'heading-1', size: 32, weight: 700, family: 'display' },
          { role: 'heading-2', size: 24, weight: 700, family: 'display' },
          { role: 'heading-3', size: 18, weight: 600, family: 'display' },
          { role: 'body', size: 14, weight: 400, family: 'body' },
          { role: 'label', size: 12, weight: 500, family: 'body' },
          { role: 'small', size: 11, weight: 400, family: 'body' },
        ],
      },
      components: {
        button: {
          primary: { bg: 'cta-primary', text: 'background-primary', radius: 'medium', padding_x: 24, padding_y: 12, min_height: 44 },
          secondary: { bg: 'transparent', text: 'cta-primary', border_color: 'zinc', border_width: 1, radius: 'medium' },
          ghost: { bg: 'transparent', text: 'cta-primary', radius: 'medium' },
        },
        card: {
          default: { bg: 'background-primary', border_color: 'zinc', border_width: 1, border_style: 'solid', radius: 'large', padding: 24 },
          highlighted: { bg: 'zinc', border_color: 'cta-primary', border_width: 2, border_style: 'solid', radius: 'large', padding: 24 },
        },
        input: {
          default: { bg: 'background-primary', text: 'text-primary', border_color: 'zinc', radius: 'medium', padding_x: 16, padding_y: 12, min_height: 44 },
          focus: { border_color: 'cta-primary', border_width: 2 },
          error: { border_color: 'error', border_width: 2 },
        },
        tab_bar: {
          active: { bg: 'cta-primary', text: 'text-primary', radius: 'pill' },
          inactive: { bg: 'transparent', text: 'text-primary' },
        },
        badge: {
          success: { bg: 'lime-accent', text: 'near-black', radius: 'pill' },
          warning: { bg: 'zinc', text: 'text-primary', radius: 'pill' },
          error: { bg: 'error', text: 'text-primary', radius: 'pill' },
          info: { bg: 'cta-primary', text: 'text-primary', radius: 'pill' },
        },
        avatar: { default: { size: 40, border_radius: 'pill', border_color: 'zinc', border_width: 2 } },
        progress_bar: {
          track: { bg: 'zinc', radius: 'pill', height: 8 },
          fill: { bg: 'cta-primary', radius: 'pill' },
        },
      },
    },
  };

  const preset = archetypes[archetype];
  return {
    version: '1.0',
    created_by: 'agentforge-init',
    colors: preset.colors,
    typography: preset.typography,
    spacing: SHARED_LAYOUT.spacing,
    borders: SHARED_LAYOUT.borders,
    touch_targets: SHARED_LAYOUT.touch_targets,
    ...(preset.components ? { components: preset.components } : {}),
  };
}

/** Map archetype to brand tone. */
const ARCHETYPE_TONES: Record<DesignArchetype, string> = {
  warm: 'playful-warm',
  professional: 'professional-clean',
  bold: 'bold-modern',
};

/** Build BrandSpec from archetype + audience. */
export function buildBrandSpec(archetype: DesignArchetype, audience: string): BrandSpec {
  return {
    version: '1.0',
    created_by: 'agentforge-init',
    identity: {
      tone: ARCHETYPE_TONES[archetype],
      audience: audience || 'general',
    },
    illustration_style: {
      direction: 'minimal',
      description: 'Clean illustrations with accent color highlights',
    },
    motion_principles: {
      page_transitions: 'fade',
      interaction_feel: 'snappy',
      easing: 'ease-out',
      duration_base_ms: 200,
    },
    accessibility: {
      wcag_level: 'AA',
    },
  };
}

/** Generate tailwind.config.ts content from design tokens. */
export function generateTailwindConfig(tokens: DesignTokensSpec): string {
  const colorEntries = Object.entries(tokens.colors.primitive)
    .map(([name, hex]) => `        '${name}': '${hex}',`)
    .join('\n');
  const spacingEntries = tokens.spacing.scale
    .map((v) => `        '${v}': '${v}px',`)
    .join('\n');
  const radiusEntries = Object.entries(tokens.borders.radius)
    .map(([name, val]) => `        '${name}': '${val}px',`)
    .join('\n');

  return `import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
${colorEntries}
      },
      spacing: {
${spacingEntries}
      },
      borderRadius: {
${radiusEntries}
      },
    },
  },
  plugins: [],
};

export default config;
`;
}

/** Generate global.css with Google Fonts import. */
export function generateGlobalCss(tokens: DesignTokensSpec): string {
  const families = Object.values(tokens.typography.font_families)
    .map((f) => f.replace(/\s+/g, '+'))
    .join('&family=');
  const importUrl = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;

  return `@import url('${importUrl}');

@tailwind base;
@tailwind components;
@tailwind utilities;
`;
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
// DEVIATION: ADR-019
// PRD v2.0 Section 9.1.1 specifies: interactive CLI wizard with 5 questions
// Implementation: wizard requires TTY; no --non-interactive flag for CI environments
// Rationale: see ADR-019 — non-interactive mode deferred to Phase 2
export async function runWizard(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<InitAnswers> {
  const rl = readline.createInterface({ input, output });

  try {
    output.write('\nWelcome to AgentForge!\n\n');

    const name = await prompt(rl, 'Project name');
    const repo = await prompt(rl, 'GitHub org/repo');
    const slackChannel = await prompt(rl, 'Primary Slack channel', '#agentforge');
    const telegramAnswer = await prompt(rl, 'Enable Telegram? (y/n)', 'y');
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
    ],
  };
}

/**
 * Scaffold the project directory structure.
 * Creates the minimal project layout without design system files.
 * Design system is generated later via `agentforge design:generate` after
 * the user provides a PRD via `agentforge describe`.
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

  // DEVIATION: ADR-011
  // PRD v2.0 Section 10.1 specifies: agent contracts "in the project manifest"
  // Implementation: agent contracts stored in separate agentforge/agents.yaml
  // Rationale: see ADR-011 — consistent with PRD's per-file pattern, keeps manifest focused
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

  // Create journeys directory for visual verification
  const journeysDir = path.join(specDir, 'journeys');
  fileSystem.mkdir(journeysDir);
  created.push('agentforge/spec/journeys/');

  // Create docs directory for PRD
  const docsDir = path.join(rootDir, 'docs');
  fileSystem.mkdir(docsDir);
  created.push('docs/');

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

  const answers = await runWizard(input, output);
  const manifest = buildManifest(answers);

  scaffoldProject(rootDir, manifest, fileSystem);

  // DEVIATION: ADR-005
  // PRD v2.0 Section 9.1.1 specifies: "Connecting Slack... done" / "Connecting Telegram... done"
  // Implementation: init records channel preferences only, does not connect
  // Rationale: see ADR-005 — tokens require env vars, connection deferred to `start` command
  out.write('\n');
  out.write(successMsg('✓ Project scaffolded\n'));
  out.write(successMsg('✓ Agent definitions created\n'));
  if (answers.slackChannel) {
    out.write(infoMsg(`  Slack channel configured: ${answers.slackChannel}\n`));
  }
  if (answers.telegramEnabled) {
    out.write(infoMsg('  Telegram channel configured\n'));
  }

  // Design system setup — two independent steps:
  //   1. Component library (code architecture)
  //   2. Visual theme (LLM-generated colors/fonts/brand)
  const inp = input ?? process.stdin;
  out.write(infoMsg('\n--- Design System ---\n'));
  out.write(infoMsg('Set up your design system now?\n'));
  out.write(infoMsg('  1. Yes — pick component library + generate theme\n'));
  out.write(infoMsg('  2. Skip for now\n'));

  let designPathChoice: number | undefined;
  while (designPathChoice === undefined) {
    const answer = await promptOnce(inp, out, '\nChoose 1 or 2: ');
    const num = parseInt(answer, 10);
    if (num === 1 || num === 2) {
      designPathChoice = num;
    } else {
      out.write(infoMsg('Please enter 1 or 2.\n'));
    }
  }

  if (designPathChoice === 1) {
    // Step 1: Component library
    await pickComponentLibrary(rootDir, inp, out, fileSystem);

    // Step 2: Visual theme (LLM or fallback archetypes)
    out.write(infoMsg('\nNow let\'s pick your visual theme...\n'));
    const designResult = await generateDesignOptions(
      { appName: answers.name, description: answers.description, targetAudience: answers.targetAudience || 'general' },
      inp,
      out,
      _config,
    );
    saveDesignTokens(rootDir, designResult.tokens, fileSystem);
    saveBrandSpec(rootDir, designResult.brand, fileSystem);
    const tailwindContent = generateTailwindConfig(designResult.tokens);
    fileSystem.writeFile(path.join(rootDir, 'tailwind.config.ts'), tailwindContent);
    const stylesDir = path.join(rootDir, 'src', 'styles');
    fileSystem.mkdir(stylesDir);
    const cssContent = generateGlobalCss(designResult.tokens);
    fileSystem.writeFile(path.join(stylesDir, 'global.css'), cssContent);
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
