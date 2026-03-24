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
  it('creates a valid manifest from wizard answers', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.version).toBe('1.0');
    expect(manifest.project.name).toBe('TaskFlow');
    expect(manifest.project.platforms).toEqual(['web']);
    expect(manifest.project.id).toMatch(/^proj_taskflow_[a-z0-9]+$/);
  });

  it('sets opinionated stack defaults', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.stack).toEqual({
      frontend: 'react',
      backend: 'node',
      database: 'postgresql',
      styling: 'tailwind',
    });
  });

  it('parses org/repo from the repo string', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.repo.provider).toBe('github');
    expect(manifest.repo.org).toBe('praveen');
    expect(manifest.repo.name).toBe('taskflow');
  });

  it('handles repo string without org', () => {
    const manifest = buildManifest({ ...DEFAULT_ANSWERS, repo: 'taskflow' });

    expect(manifest.repo.org).toBe('');
    expect(manifest.repo.name).toBe('taskflow');
  });

  it('sets HITL defaults for Persona B', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.hitl.default).toBe('review_and_override');
    expect(manifest.hitl.overrides).toEqual({
      design: 'full_approval',
      production_deploy: 'full_approval',
      test_generation: 'notify_only',
    });
  });

  it('includes Telegram channel when enabled', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.channels).toHaveLength(3);
    expect(manifest.channels[0]).toEqual({ type: 'slack', capabilities: 'full', priority: 1 });
    expect(manifest.channels[1]).toEqual({ type: 'telegram', capabilities: 'approvals', priority: 2 });
    expect(manifest.channels[2]).toEqual({ type: 'cli', capabilities: 'basic', priority: 3 });
  });

  it('excludes Telegram channel when disabled', () => {
    const manifest = buildManifest({ ...DEFAULT_ANSWERS, telegramEnabled: false });

    expect(manifest.channels).toHaveLength(2);
    expect(manifest.channels.map((c) => c.type)).toEqual(['slack', 'cli']);
  });

  it('sets budget defaults', () => {
    const manifest = buildManifest(DEFAULT_ANSWERS);

    expect(manifest.budget).toEqual({
      per_task_max_usd: 2.0,
      per_phase_max_usd: 25.0,
      monthly_max_usd: 200.0,
      alert_threshold: 0.8,
    });
  });
});

describe('scaffoldProject', () => {
  it('creates the spec directory structure', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.dirs.has('/project/agentforge/spec/components')).toBe(true);
    expect(fs.dirs.has('/project/.agentforge/learnings')).toBe(true);
    expect(fs.dirs.has('/project/.agentforge/audit')).toBe(true);
  });

  it('writes the project manifest', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge.yaml')).toBe(true);
    const content = fs.files.get('/project/agentforge.yaml')!;
    expect(content).toContain('TaskFlow');
  });

  it('writes an empty tasks file', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge.tasks.yaml')).toBe(true);
    const content = fs.files.get('/project/agentforge.tasks.yaml')!;
    expect(content).toContain('tasks');
  });

  it('writes seed spec files', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge/spec/project.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/pages.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/api.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/models.yaml')).toBe(true);
  });

  it('does NOT create design system files during init', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge/spec/design-tokens.yaml')).toBe(false);
    expect(fs.files.has('/project/agentforge/spec/brand.yaml')).toBe(false);
    expect(fs.files.has('/project/tailwind.config.ts')).toBe(false);
    expect(fs.files.has('/project/src/styles/global.css')).toBe(false);
  });

  it('creates docs/ directory', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.dirs.has('/project/docs')).toBe(true);
  });

  it('returns list of created files and directories', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    const created = scaffoldProject('/project', manifest, fs, new Map());

    expect(created).toContain('agentforge.yaml');
    expect(created).toContain('agentforge.tasks.yaml');
    expect(created).toContain('agentforge/spec/project.yaml');
    expect(created).toContain('docs/');
  });

  it('creates app directories', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.dirs.has('/project/src/components')).toBe(true);
    expect(fs.dirs.has('/project/src/pages')).toBe(true);
    expect(fs.dirs.has('/project/src/api')).toBe(true);
    expect(fs.dirs.has('/project/src/lib')).toBe(true);
    expect(fs.dirs.has('/project/prisma')).toBe(true);
  });

  it('creates locks directory and trust-state', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.dirs.has('/project/.agentforge/locks')).toBe(true);
    expect(fs.files.has('/project/.agentforge/trust-state.yaml')).toBe(true);
  });

  it('writes agents.yaml with Phase 1 agent definitions', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);

    scaffoldProject('/project', manifest, fs, new Map());

    expect(fs.files.has('/project/agentforge/agents.yaml')).toBe(true);
    const content = fs.files.get('/project/agentforge/agents.yaml')!;
    expect(content).toContain('ux_researcher');
    expect(content).toContain('code_generator');
    expect(content).toContain('code_reviewer');
  });

  it('writes rendered template files', () => {
    const fs = createMockFs();
    const manifest = buildManifest(DEFAULT_ANSWERS);
    const templates = new Map([
      ['package.json', '{"name": "TaskFlow"}'],
      ['tsconfig.json', '{"strict": true}'],
    ]);

    const created = scaffoldProject('/project', manifest, fs, templates);

    expect(fs.files.has('/project/package.json')).toBe(true);
    expect(fs.files.get('/project/package.json')).toBe('{"name": "TaskFlow"}');
    expect(created).toContain('package.json');
    expect(created).toContain('tsconfig.json');
  });
});

/**
 * Creates a readable stream that feeds answers line-by-line.
 * Uses a delay between answers to avoid readline buffering issues
 * when multiple readline consumers share the same input stream.
 */
function createWizardInput(answers: string[], delayMs = 50): PassThrough {
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
  it('creates the target directory if it does not exist', async () => {
    const fs = createMockFs();
    // Wizard: name, repo, slack, telegram → design system (2=skip) → engine setup 'n'
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '2', 'n'], 500);
    const output = new PassThrough();

    await initCommand('/new-project', fs, input, output, noOpConfig);

    expect(fs.dirs.has('/new-project')).toBe(true);
    expect(fs.files.has('/new-project/agentforge.yaml')).toBe(true);
  }, 15000);

  it('scaffolds into an existing empty directory', async () => {
    const fs = createMockFs();
    fs.dirs.add('/existing-dir');
    // Wizard: name, repo, slack, telegram → design system (2=skip) → engine setup 'n'
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '2', 'n'], 500);
    const output = new PassThrough();

    await initCommand('/existing-dir', fs, input, output, noOpConfig);

    expect(fs.files.has('/existing-dir/agentforge.yaml')).toBe(true);
  }, 15000);

  it('aborts if target directory is the AgentForge monorepo', async () => {
    const fs = createMockFs();
    // Simulate monorepo markers
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
    // Should NOT have created agentforge.yaml
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

  it('post-scaffold message mentions agentforge describe', async () => {
    const fs = createMockFs();
    // Wizard: name, repo, slack, telegram → design system (2=skip) → engine setup 'n'
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '2', 'n'], 500);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    await initCommand('/project', fs, input, output, noOpConfig);

    expect(outputStr).toContain('agentforge describe');
  }, 15000);

  it('design system path writes component-library.yaml + theme files', async () => {
    const fs = createMockFs();
    // More answers needed: wizard(4) + design-yes(1) + library(1) + theme-choice(1) + engine(1)
    // Use shorter delay to avoid timeout — the stream feeds answers as each prompt appears
    const input = createWizardInput(['MyApp', 'org/repo', '#dev', 'y', '1', '1', '1', 'n'], 200);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (d: Buffer) => { outputStr += d.toString(); });

    await initCommand('/project', fs, input, output, noOpConfig);

    // Component library should be written
    expect(fs.files.has('/project/agentforge/spec/component-library.yaml')).toBe(true);
    const libContent = fs.files.get('/project/agentforge/spec/component-library.yaml')!;
    expect(libContent).toContain('shadcn');
    expect(libContent).toContain('@/components/ui/button');

    // Theme files should also be written (from LLM fallback archetypes)
    expect(fs.files.has('/project/agentforge/spec/design-tokens.yaml')).toBe(true);
    expect(fs.files.has('/project/agentforge/spec/brand.yaml')).toBe(true);
    expect(fs.files.has('/project/tailwind.config.ts')).toBe(true);

    expect(outputStr).toContain('Design system configured');
  }, 60000);
});
