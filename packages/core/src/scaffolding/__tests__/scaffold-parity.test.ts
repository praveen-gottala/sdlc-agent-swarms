import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { scaffoldProject } from '../scaffold-project.js';
import { createRealFs } from '../../fs/file-system.js';
import { buildDesignTokensSpec, buildBrandSpec } from '../../design/archetypes.js';
import type { ScaffoldProjectInput } from '../../types/scaffold.js';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'scaffold-parity-'));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

const MINIMAL_CONFIG = {
  version: '1.0',
  project: { name: 'Test App', description: 'A test', platforms: ['web'] },
  stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
  budget: { per_task_max_usd: 2.0, per_phase_max_usd: 25.0, monthly_max_usd: 200.0 },
};

describe('scaffoldProject', () => {
  let projectDir: string;
  const fs = createRealFs();

  beforeEach(() => {
    projectDir = makeTempDir();
  });

  afterEach(() => {
    cleanup(projectDir);
  });

  it('creates agentforge.yaml with correct structure', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'agentforge.yaml'), 'utf-8');
    const parsed = parseYaml(content) as Record<string, unknown>;
    expect(parsed).toEqual(MINIMAL_CONFIG);
  });

  it('creates pages.yaml with empty pages list', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'agentforge', 'spec', 'pages.yaml'), 'utf-8');
    const parsed = parseYaml(content) as { version: string; pages: unknown[] };
    expect(parsed.version).toBe('1.0');
    expect(parsed.pages).toEqual([]);
  });

  it('creates project.yaml with app name and description', () => {
    const result = scaffoldProject(
      { name: 'My App', description: 'A cool app', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'agentforge', 'spec', 'project.yaml'), 'utf-8');
    const parsed = parseYaml(content) as { app: { name: string; description: string }; adrs: unknown[] };
    expect(parsed.app.name).toBe('My App');
    expect(parsed.app.description).toBe('A cool app');
    expect(parsed.adrs).toEqual([]);
  });

  it('creates agentforge/designs/ directory', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'agentforge', 'designs'))).toBe(true);
  });

  it('creates docs/ directory', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'docs'))).toBe(true);
  });

  it('writes design-tokens.yaml when tokens provided', () => {
    const tokens = buildDesignTokensSpec('warm');
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, designTokens: tokens },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'agentforge', 'spec', 'design-tokens.yaml'), 'utf-8');
    const parsed = parseYaml(content) as { version: string; colors: unknown };
    expect(parsed.version).toBe('1.0');
    expect(parsed.colors).toBeDefined();
  });

  it('does not write design-tokens.yaml when tokens omitted', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'agentforge', 'spec', 'design-tokens.yaml'))).toBe(false);
  });

  it('writes brand.yaml when brandSpec provided', () => {
    const brand = buildBrandSpec('professional', 'developers');
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, brandSpec: brand },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'agentforge', 'spec', 'brand.yaml'), 'utf-8');
    const parsed = parseYaml(content) as { identity: { tone: string } };
    expect(parsed.identity.tone).toBe('professional-clean');
  });

  it('writes tailwind.config.ts and globals.css when tokens provided', () => {
    const tokens = buildDesignTokensSpec('professional');
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, designTokens: tokens },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'tailwind.config.ts'))).toBe(true);
    expect(existsSync(join(projectDir, 'src', 'styles', 'globals.css'))).toBe(true);

    const tailwind = readFileSync(join(projectDir, 'tailwind.config.ts'), 'utf-8');
    expect(tailwind).toContain("content: ['./src/**/*.{js,ts,jsx,tsx}']");

    const css = readFileSync(join(projectDir, 'src', 'styles', 'globals.css'), 'utf-8');
    expect(css).toContain('@tailwind base');
  });

  it('skips tailwind when generateTailwind is false', () => {
    const tokens = buildDesignTokensSpec('professional');
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, designTokens: tokens, generateTailwind: false },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'tailwind.config.ts'))).toBe(false);
    expect(existsSync(join(projectDir, 'src', 'styles', 'globals.css'))).toBe(false);
  });

  it('writes docs/prd.md when prdContent provided', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, prdContent: '# My PRD\n\nSome content.' },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    const content = readFileSync(join(projectDir, 'docs', 'prd.md'), 'utf-8');
    expect(content).toBe('# My PRD\n\nSome content.');
  });

  it('does not write prd.md when prdContent is empty/whitespace', () => {
    const result = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, prdContent: '   ' },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    expect(existsSync(join(projectDir, 'docs', 'prd.md'))).toBe(false);
  });

  it('returns deterministic createdFiles list', () => {
    const tokens = buildDesignTokensSpec('warm');
    const brand = buildBrandSpec('warm', 'general');

    const result1 = scaffoldProject(
      { name: 'Test App', projectConfig: MINIMAL_CONFIG, designTokens: tokens, brandSpec: brand },
      projectDir,
      fs,
    );

    const projectDir2 = makeTempDir();
    try {
      const result2 = scaffoldProject(
        { name: 'Test App', projectConfig: MINIMAL_CONFIG, designTokens: tokens, brandSpec: brand },
        projectDir2,
        fs,
      );

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.createdFiles).toEqual(result2.value.createdFiles);
      }
    } finally {
      cleanup(projectDir2);
    }
  });

  it('returns the correct file list for a full scaffold', () => {
    const tokens = buildDesignTokensSpec('warm');
    const brand = buildBrandSpec('warm', 'general');

    const result = scaffoldProject(
      {
        name: 'Test App',
        projectConfig: MINIMAL_CONFIG,
        designTokens: tokens,
        brandSpec: brand,
        componentLibraryId: 'shadcn',
        prdContent: '# PRD',
      },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.createdFiles).toContain('agentforge.yaml');
    expect(result.value.createdFiles).toContain('agentforge/spec/pages.yaml');
    expect(result.value.createdFiles).toContain('agentforge/spec/project.yaml');
    expect(result.value.createdFiles).toContain('agentforge/spec/design-tokens.yaml');
    expect(result.value.createdFiles).toContain('agentforge/spec/brand.yaml');
    expect(result.value.createdFiles).toContain('tailwind.config.ts');
    expect(result.value.createdFiles).toContain('src/styles/globals.css');
    expect(result.value.createdFiles).toContain('agentforge/spec/component-catalog.yaml');
    expect(result.value.createdFiles).toContain('docs/prd.md');
  });

  it('produces byte-identical output for identical input', () => {
    const input: ScaffoldProjectInput = {
      name: 'Parity Check',
      description: 'Testing identical output',
      projectConfig: MINIMAL_CONFIG,
      designTokens: buildDesignTokensSpec('bold'),
      brandSpec: buildBrandSpec('bold', 'engineers'),
    };

    const r1 = scaffoldProject(input, projectDir, fs);
    expect(r1.ok).toBe(true);
    const yamlA = readFileSync(join(projectDir, 'agentforge.yaml'), 'utf-8');
    const tokensA = readFileSync(join(projectDir, 'agentforge', 'spec', 'design-tokens.yaml'), 'utf-8');
    const tailwindA = readFileSync(join(projectDir, 'tailwind.config.ts'), 'utf-8');

    const projectDir2 = makeTempDir();
    try {
      const r2 = scaffoldProject(input, projectDir2, fs);
      expect(r2.ok).toBe(true);
      const yamlB = readFileSync(join(projectDir2, 'agentforge.yaml'), 'utf-8');
      const tokensB = readFileSync(join(projectDir2, 'agentforge', 'spec', 'design-tokens.yaml'), 'utf-8');
      const tailwindB = readFileSync(join(projectDir2, 'tailwind.config.ts'), 'utf-8');

      expect(yamlA).toBe(yamlB);
      expect(tokensA).toBe(tokensB);
      expect(tailwindA).toBe(tailwindB);
    } finally {
      cleanup(projectDir2);
    }
  });

  it('core scaffold is deterministic for the same shared input regardless of projectConfig shape', () => {
    const tokens = buildDesignTokensSpec('professional');
    const brand = buildBrandSpec('professional', 'general users');

    // Simulate CLI: passes full ProjectManifest as projectConfig
    const cliConfig = {
      version: '1.0',
      project: { name: 'Parity App', description: 'Test parity', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      budget: { per_task_max_usd: 2.0, per_phase_max_usd: 25.0, monthly_max_usd: 200.0 },
      repo: { provider: 'github', org: 'test', name: 'parity' },
    };

    const r1 = scaffoldProject(
      { name: 'Parity App', description: 'Test parity', projectConfig: cliConfig, designTokens: tokens, brandSpec: brand, componentLibraryId: 'shadcn' },
      projectDir,
      fs,
    );
    expect(r1.ok).toBe(true);

    // Simulate dashboard: passes minimal projectConfig
    const dashConfig = {
      version: '1.0',
      project: { name: 'Parity App', description: 'Test parity', platforms: ['web'] },
      stack: { frontend: 'react', backend: 'node', database: 'postgresql', styling: 'tailwind' },
      budget: { per_task_max_usd: 2.0, per_phase_max_usd: 25.0, monthly_max_usd: 200.0 },
    };

    const projectDir2 = makeTempDir();
    try {
      const r2 = scaffoldProject(
        { name: 'Parity App', description: 'Test parity', projectConfig: dashConfig, designTokens: tokens, brandSpec: brand, componentLibraryId: 'shadcn' },
        projectDir2,
        fs,
      );
      expect(r2.ok).toBe(true);

      // Shared spec files must be byte-identical regardless of projectConfig shape
      const sharedFiles = [
        'agentforge/spec/pages.yaml',
        'agentforge/spec/project.yaml',
        'agentforge/spec/design-tokens.yaml',
        'agentforge/spec/brand.yaml',
        'agentforge/spec/component-catalog.yaml',
        'tailwind.config.ts',
        'src/styles/globals.css',
      ];

      for (const file of sharedFiles) {
        const a = readFileSync(join(projectDir, file), 'utf-8');
        const b = readFileSync(join(projectDir2, file), 'utf-8');
        expect(a).toBe(b);
      }

      // agentforge.yaml differs because projectConfig differs — that's expected
      const yamlA = readFileSync(join(projectDir, 'agentforge.yaml'), 'utf-8');
      const yamlB = readFileSync(join(projectDir2, 'agentforge.yaml'), 'utf-8');
      expect(yamlA).not.toBe(yamlB);
    } finally {
      cleanup(projectDir2);
    }
  });

  it('returns Err when directory creation fails', () => {
    // Write a regular file where a directory is expected — mkdir will fail
    const blocker = join(projectDir, 'agentforge');
    writeFileSync(blocker, 'not-a-directory');

    const result = scaffoldProject(
      { name: 'Fail Test', projectConfig: MINIMAL_CONFIG },
      projectDir,
      fs,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('agentforge');
    }
    // No spec files should have been written past the failure point
    expect(existsSync(join(projectDir, 'agentforge.yaml'))).toBe(false);
  });
});
