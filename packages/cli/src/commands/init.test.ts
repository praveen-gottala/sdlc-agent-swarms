/**
 * Unit tests for `agentforge init` CLI plumbing.
 *
 * Scope discipline (see CLAUDE.md §Test Quality Gates):
 *   - Core scaffold parity is owned by
 *     `packages/core/src/scaffolding/__tests__/scaffold-parity.test.ts`.
 *     This file MUST NOT re-assert what core already covers.
 *   - Tailwind/CSS/token generation is owned by
 *     `packages/core/src/design/__tests__/tailwind-generator.test.ts`.
 *     This file MUST NOT re-assert what core already covers.
 *   - Tests here cover only CLI-specific behavior:
 *     buildManifest, scaffoldCliExtras file set, the init wizard flow,
 *     and abort guards.
 */

import { buildManifest, scaffoldProject, initCommand } from './init.js';
import type { InitAnswers } from './init.js';
import type { FileSystem } from '../fs-utils.js';
import { PassThrough } from 'node:stream';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true, value: undefined };
    },
    rename(_oldPath: string, _newPath: string) {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented in mock', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true, value: undefined };
    },
    listDir(_dirPath: string) {
      return { ok: true, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true, value: undefined };
    },
  };
}

const DEFAULT_ANSWERS: InitAnswers = {
  name: 'TaskFlow',
  description: '',
  repo: 'praveen/taskflow',
  slackChannel: '#agentforge',
  telegramEnabled: true,
  targetAudience: '',
};

describe('buildManifest', () => {
  it('produces a valid manifest with stack/HITL/budget/channel defaults from wizard answers', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.version).toBe('1.0');
    expect(manifest.project.name).toBe('TaskFlow');
    expect(manifest.project.platforms).toEqual(['web']);
    expect(manifest.project.id).toMatch(/^proj_taskflow_[a-z0-9]+$/);

    expect(manifest.stack).toEqual({
      frontend: 'react',
      backend: 'node',
      database: 'postgresql',
      styling: 'tailwind',
    });

    expect(manifest.repo.provider).toBe('github');
    expect(manifest.repo.org).toBe('praveen');
    expect(manifest.repo.name).toBe('taskflow');

    expect(manifest.hitl.default).toBe('review_and_override');
    expect(manifest.hitl.overrides).toEqual({
      design: 'full_approval',
      production_deploy: 'full_approval',
      test_generation: 'notify_only',
    });

    expect(manifest.budget).toEqual({
      per_task_max_usd: 2.0,
      per_phase_max_usd: 25.0,
      monthly_max_usd: 200.0,
      alert_threshold: 0.8,
    });

    expect(manifest.channels).toHaveLength(3);
    expect(manifest.channels.map((c) => c.type)).toEqual(['slack', 'telegram', 'cli']);
  });

  it('handles repo string without org', () => {
    const manifest = buildManifest({ ...DEFAULT_ANSWERS, repo: 'taskflow' });
    expect(manifest.repo.org).toBe('');
    expect(manifest.repo.name).toBe('taskflow');
  });

  it('excludes Telegram channel when disabled', () => {
    const manifest = buildManifest({ ...DEFAULT_ANSWERS, telegramEnabled: false });
    expect(manifest.channels).toHaveLength(2);
    expect(manifest.channels.map((c) => c.type)).toEqual(['slack', 'cli']);
  });
});

describe('CLI scaffoldProject wrapper (CLI-extras only)', () => {
  // Core scaffold parity is owned by scaffold-parity.test.ts. These tests
  // cover only the extras the CLI wrapper layers on top: agent contracts,
  // tasks file, app dirs, .agentforge/ internal dirs, scaffold templates.

  it('writes CLI-only extras: agents.yaml, tasks file, trust-state, and app/internal dirs', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    const created = scaffoldProject('/project', manifest, fs, new Map());

    // CLI extras files
    expect(fs.files.has('/project/agentforge.tasks.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/agents.yaml')).toBe(true);
    expect(fs.files.has('/project/.agentforge/trust-state.yaml')).toBe(true);

    // Internal + app dirs
    expect(fs.dirs.has('/project/.agentforge/learnings')).toBe(true);
    expect(fs.dirs.has('/project/.agentforge/audit')).toBe(true);
    expect(fs.dirs.has('/project/.agentforge/locks')).toBe(true);
    expect(fs.dirs.has('/project/src/components')).toBe(true);
    expect(fs.dirs.has('/project/src/pages')).toBe(true);
    expect(fs.dirs.has('/project/src/api')).toBe(true);
    expect(fs.dirs.has('/project/src/lib')).toBe(true);
    expect(fs.dirs.has('/project/prisma')).toBe(true);

    // Returned list includes both core files AND CLI extras
    expect(created).toContain('agentforge.yaml');
    expect(created).toContain('agentforge/spec/project.yaml');
    expect(created).toContain('agentforge.tasks.yaml');
    expect(created).toContain('agentforge/agents.yaml');
    expect(created).toContain('.agentforge/trust-state.yaml');
  });

  it('agents.yaml carries Phase 1 agent roles', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    const content = fs.files.get('/project/agentforge/agents.yaml')!;
    expect(content).toContain('ux_researcher');
    expect(content).toContain('code_generator');
    expect(content).toContain('code_reviewer');
  });

  it('does NOT create design system files during init (deferred to design-system step)', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge/spec/design-tokens.yaml')).toBe(false);
    expect(fs.files.has('/project/agentforge/spec/brand.yaml')).toBe(false);
    expect(fs.files.has('/project/tailwind.config.ts')).toBe(false);
    expect(fs.files.has('/project/src/styles/globals.css')).toBe(false);
  });

  it('writes rendered template files passed by caller', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);
    const templates = new Map([
      ['package.json', '{"name": "TaskFlow"}'],
      ['tsconfig.json', '{"strict": true}'],
    ]);

    const created = scaffoldProject('/project', manifest, fs, templates);

    expect(fs.files.get('/project/package.json')).toBe('{"name": "TaskFlow"}');
    expect(fs.files.get('/project/tsconfig.json')).toBe('{"strict": true}');
    expect(created).toContain('package.json');
    expect(created).toContain('tsconfig.json');
  });

  it('throws when core scaffoldProject returns Err (CLI wrapper unwraps the Result)', () => {
    const fs = createMockFs();
    fs.mkdir = () => ({
      ok: false as const,
      error: { code: 'INVALID_STATE' as const, message: 'EACCES: permission denied', recoverable: false },
    });
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(() => scaffoldProject('/project', manifest, fs, new Map())).toThrow('EACCES: permission denied');
  });
});

/**
 * Creates a readable stream that feeds answers line-by-line.
 * Uses a delay between answers to avoid readline buffering issues
 * when multiple readline consumers share the same input stream.
 */
function createWizardInput(answers: string[], delayMs = 500): PassThrough {
  const stream = new PassThrough();
  let index = 0;
  const interval = setInterval(() => {
    if (index < answers.length) {
      stream.write(answers[index] + '\n');
      index++;
    } else {
      clearInterval(interval);
    }
  }, delayMs);
  return stream;
}

/** No-op config for tests. */
const noOpConfig = { openBrowser: async () => false };

describe('initCommand', () => {
  it('runs the full skip-design wizard end-to-end (creates dir, scaffolds, prints describe hint, no errors)', async () => {
    const fs = createMockFs();
    // Wizard: name, repo, slack, telegram → design choice '2' (skip) → engine setup 'n'
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '2', 'n']);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    const origExitCode = process.exitCode;
    await initCommand('/new-project', fs, input, output, noOpConfig);

    // Directory + scaffold completed
    expect(fs.dirs.has('/new-project')).toBe(true);
    expect(fs.files.has('/new-project/agentforge.yaml')).toBe(true);

    // Output covers all three previously-separate assertions
    expect(outputStr).toContain('Project scaffolded');
    expect(outputStr).toContain('agentforge describe');
    expect(outputStr).not.toContain('Error');

    // No failure exit code set
    expect(process.exitCode).toBe(origExitCode);
  }, 15000);

  it('aborts if target directory is the AgentForge monorepo', async () => {
    const fs = createMockFs();
    fs.files.set('/monorepo/nx.json', '{}');
    fs.dirs.add('/monorepo/packages');
    const input = createWizardInput([]);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    const origExitCode = process.exitCode;
    await initCommand('/monorepo', fs, input, output, noOpConfig);

    expect(process.exitCode).toBe(1);
    expect(outputStr).toContain('monorepo');
    expect(outputStr).toContain('agentforge init ./my-app');
    expect(fs.files.has('/monorepo/agentforge.yaml')).toBe(false);
    process.exitCode = origExitCode;
  });

  it('aborts if target directory already has agentforge.yaml', async () => {
    const fs = createMockFs();
    fs.files.set('/existing-dir/agentforge.yaml', 'version: "1.0"');
    const input = createWizardInput([]);
    const output = new PassThrough();

    const origExitCode = process.exitCode;
    await initCommand('/existing-dir', fs, input, output, noOpConfig);

    expect(process.exitCode).toBe(1);
    expect(fs.files.get('/existing-dir/agentforge.yaml')).toBe('version: "1.0"');
    process.exitCode = origExitCode;
  });

  it('design-system path writes component-library.yaml + theme files', async () => {
    const fs = createMockFs();
    // Prompts: wizard(4) + design-path(1) + library(1) + prd(1) + theme(1) + engine(1) = 9
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '1', '1', 'n', '1', 'n']);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    await initCommand('/project', fs, input, output, noOpConfig);

    expect(fs.files.has('/project/agentforge/spec/component-library.yaml')).toBe(true);
    const libContent = fs.files.get('/project/agentforge/spec/component-library.yaml')!;
    expect(libContent).toContain('shadcn');
    expect(libContent).toContain('@/components/ui/button');

    expect(fs.files.has('/project/agentforge/spec/design-tokens.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/brand.yaml')).toBe(true);
    expect(fs.files.has('/project/tailwind.config.ts')).toBe(true);

    expect(fs.files.has('/project/agentforge/spec/component-catalog.yaml')).toBe(true);
    const catalogContent = fs.files.get('/project/agentforge/spec/component-catalog.yaml')!;
    expect(catalogContent).toContain('shadcn');
    expect(catalogContent).not.toContain('mui');
    expect(catalogContent).not.toContain('chakra');

    expect(outputStr).toContain('Component catalog generated');
    expect(outputStr).toContain('Design system configured');
  }, 120000);
});
