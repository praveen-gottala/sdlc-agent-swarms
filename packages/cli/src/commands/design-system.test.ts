import { designSystemShowCommand, designSystemValidateCommand, pickComponentLibrary } from './design-system.js';
import { scaffoldProject, buildManifest, buildDesignTokensSpec, buildBrandSpec } from './init.js';
import type { InitAnswers } from './init.js';
import type { FileSystem } from '../fs-utils.js';
import { PassThrough, Readable } from 'node:stream';
import { saveDesignTokens, saveBrandSpec, loadComponentLibrary } from '@agentforge/core';

function createMockFs(): FileSystem & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true as const, value: content };
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return { ok: true as const, value: undefined };
    },
    exists(filePath: string) {
      return files.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true as const, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not implemented', recoverable: false } };
    },
    remove(filePath: string) {
      files.delete(filePath);
      return { ok: true as const, value: undefined };
    },
    listDir() {
      return { ok: true as const, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return { ok: true as const, value: undefined };
    },
  };
}

const DEFAULT_ANSWERS: InitAnswers = {
  name: 'TestApp',
  description: 'A test app',
  repo: 'test/app',
  slackChannel: '#test',
  telegramEnabled: false,
  targetAudience: 'developers',
};

function scaffoldTestProject(fs: ReturnType<typeof createMockFs>, archetype: 'warm' | 'professional' | 'bold' = 'professional'): void {
  const manifest = buildManifest(DEFAULT_ANSWERS);
  scaffoldProject('/project', manifest, fs, new Map());
  // Design system files are no longer created by scaffoldProject — create them manually
  const tokens = buildDesignTokensSpec(archetype);
  const brand = buildBrandSpec(archetype, DEFAULT_ANSWERS.targetAudience);
  saveDesignTokens('/project', tokens, fs);
  saveBrandSpec('/project', brand, fs);
}

describe('design-system show', () => {
  it('prints design tokens when files exist', async () => {
    const fs = createMockFs();
    scaffoldTestProject(fs);

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    await designSystemShowCommand('/project', fs, output);

    expect(outputStr).toContain('blue-accent');
    expect(outputStr).toContain('DM Sans');
    expect(outputStr).toContain('professional-clean');
  });

  it('prints actionable error when no files exist', async () => {
    const fs = createMockFs();

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    await designSystemShowCommand('/empty', fs, output);

    expect(outputStr).toContain('Design tokens not found');
    expect(outputStr).toContain('agentforge init');
  });
});

describe('design-system validate', () => {
  it('passes for valid scaffolded project', async () => {
    const fs = createMockFs();
    scaffoldTestProject(fs);

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    const origExitCode = process.exitCode;
    await designSystemValidateCommand('/project', fs, output);

    expect(outputStr).toContain('valid');
    expect(process.exitCode).not.toBe(1);
    process.exitCode = origExitCode;
  });

  it('fails when semantic references broken', async () => {
    const fs = createMockFs();
    scaffoldTestProject(fs);

    // Corrupt semantic to reference nonexistent primitive
    const tokens = buildDesignTokensSpec('professional');
    const corrupted = {
      ...tokens,
      colors: {
        ...tokens.colors,
        semantic: { 'bg-primary': 'nonexistent-color' },
      },
    };
    saveDesignTokens('/project', corrupted, fs);

    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    const origExitCode = process.exitCode;
    await designSystemValidateCommand('/project', fs, output);

    expect(outputStr).toContain('nonexistent-color');
    expect(process.exitCode).toBe(1);
    process.exitCode = origExitCode;
  });
});

describe('pickComponentLibrary', () => {
  it('defaults to shadcn when Enter (empty line)', async () => {
    const fs = createMockFs();
    const input = Readable.from(['\n']);
    const output = new PassThrough();

    const selected = await pickComponentLibrary('/project', input, output, fs);

    expect(selected.id).toBe('shadcn');
    const libResult = loadComponentLibrary('/project', fs);
    expect(libResult.ok).toBe(true);
    if (libResult.ok) {
      expect(libResult.value.library_id).toBe('shadcn');
    }
  });

  it('writes component-library.yaml for shadcn (choice 1)', async () => {
    const fs = createMockFs();
    const input = Readable.from(['1\n']);
    const output = new PassThrough();
    let outputStr = '';
    output.on('data', (chunk: Buffer) => { outputStr += chunk.toString(); });

    const selected = await pickComponentLibrary('/project', input, output, fs);

    // Returns the selected preset
    expect(selected.id).toBe('shadcn');
    expect(selected.libraryName).toBe('shadcn/ui');

    // component-library.yaml should be written with correct data
    const libResult = loadComponentLibrary('/project', fs);
    expect(libResult.ok).toBe(true);
    if (libResult.ok) {
      expect(libResult.value.library_id).toBe('shadcn');
      expect(libResult.value.react_mappings.button.import_path).toBe('@/components/ui/button');
      expect(libResult.value.react_mappings.button.component_name).toBe('Button');
    }

    // Should NOT write design tokens or brand (that's a separate step)
    expect(fs.files.has('/project/agentforge/spec/design-tokens.yaml')).toBe(false);
    expect(fs.files.has('/project/agentforge/spec/brand.yaml')).toBe(false);

    expect(outputStr).toContain('shadcn/ui');
    expect(outputStr).toContain('npx shadcn-ui@latest init');
  });

  it('writes correct library for MUI (choice 2)', async () => {
    const fs = createMockFs();
    const input = Readable.from(['2\n']);
    const output = new PassThrough();

    const selected = await pickComponentLibrary('/project', input, output, fs);

    expect(selected.id).toBe('mui');

    const libResult = loadComponentLibrary('/project', fs);
    expect(libResult.ok).toBe(true);
    if (libResult.ok) {
      expect(libResult.value.library_id).toBe('mui');
      expect(libResult.value.react_mappings.button.import_path).toBe('@mui/material/Button');
    }
  });

  it('writes correct library for Mantine (choice 6)', async () => {
    const fs = createMockFs();
    const input = Readable.from(['6\n']);
    const output = new PassThrough();

    const selected = await pickComponentLibrary('/project', input, output, fs);

    expect(selected.id).toBe('mantine');

    const libResult = loadComponentLibrary('/project', fs);
    expect(libResult.ok).toBe(true);
    if (libResult.ok) {
      expect(libResult.value.library_id).toBe('mantine');
      expect(libResult.value.react_mappings.input.component_name).toBe('TextInput');
    }
  });
});
