import { mkdtempSync, existsSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readYaml, writeYaml } from './yaml-utils.js';
import { createRealFs } from './file-system.js';
import type { FileSystem } from './file-system.js';
import { Ok, Err } from '../types/result.js';

/**
 * Create an in-memory FileSystem backed by a Map for unit testing.
 */
function createMockFs(files: Map<string, string> = new Map()): FileSystem {
  return {
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${filePath}`,
          recoverable: false,
        });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string) {
      return files.has(filePath);
    },
    mkdir() {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string) {
      const content = files.get(oldPath);
      if (content === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${oldPath}`,
          recoverable: false,
        });
      }
      files.set(newPath, content);
      files.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string) {
      files.delete(filePath);
      return Ok(undefined);
    },
    listDir() {
      return Ok([...files.keys()]);
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

/**
 * Create a mock FileSystem where writeFileAtomic always fails.
 */
function createFailingWriteFs(): FileSystem {
  const base = createMockFs();
  return {
    ...base,
    writeFileAtomic() {
      return Err({
        code: 'INVALID_STATE' as const,
        message: 'Disk full',
        recoverable: false,
      });
    },
  };
}

describe('readYaml', () => {
  it('succeeds with valid YAML', () => {
    const files = new Map([
      ['/test.yaml', 'name: hello\ncount: 42\n'],
    ]);
    const fs = createMockFs(files);
    const result = readYaml<{ name: string; count: number }>('/test.yaml', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'hello', count: 42 });
    }
  });

  it('fails on missing file', () => {
    const fs = createMockFs();
    const result = readYaml('/missing.yaml', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('missing.yaml');
    }
  });

  it('fails on invalid YAML', () => {
    const files = new Map([
      ['/bad.yaml', '{ invalid yaml: [: }'],
    ]);
    const fs = createMockFs(files);
    const result = readYaml('/bad.yaml', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('Failed to parse YAML');
    }
  });
});

describe('writeYaml', () => {
  it('writes valid YAML via writeFileAtomic', () => {
    const files = new Map<string, string>();
    const fs = createMockFs(files);
    const data = { name: 'test', items: [1, 2, 3] };

    const result = writeYaml('/out.yaml', data, fs);

    expect(result.ok).toBe(true);
    expect(files.has('/out.yaml')).toBe(true);

    const content = files.get('/out.yaml')!;
    expect(content).toContain('name: test');
    expect(content).toContain('- 1');
  });

  it('prepends header when provided', () => {
    const files = new Map<string, string>();
    const fs = createMockFs(files);
    const data = { version: '1.0', pages: [] };
    const header = '# pages.yaml — created on-demand\n# schema: { version, pages[] }';

    const result = writeYaml('/out.yaml', data, fs, header);

    expect(result.ok).toBe(true);
    const content = files.get('/out.yaml')!;
    expect(content).toMatch(/^# pages\.yaml/);
    expect(content).toContain('version: "1.0"');

    // Verify readYaml can still parse the file (YAML ignores comments)
    const readResult = readYaml<{ version: string; pages: unknown[] }>('/out.yaml', fs);
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value.version).toBe('1.0');
      expect(readResult.value.pages).toEqual([]);
    }
  });

  it('does not prepend header when not provided', () => {
    const files = new Map<string, string>();
    const fs = createMockFs(files);
    const data = { name: 'test' };

    writeYaml('/out.yaml', data, fs);

    const content = files.get('/out.yaml')!;
    expect(content).not.toMatch(/^#/);
    expect(content).toContain('name: test');
  });

  it('handles write errors', () => {
    const fs = createFailingWriteFs();
    const result = writeYaml('/out.yaml', { data: 1 }, fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toBe('Disk full');
    }
  });
});

describe('round-trip', () => {
  it('writeYaml then readYaml returns same data', () => {
    const files = new Map<string, string>();
    const fs = createMockFs(files);
    const original = {
      project: 'agentforge',
      version: 1,
      agents: ['pm', 'dev', 'qa'],
      config: { strict: true, timeout: 30 },
    };

    const writeResult = writeYaml('/round.yaml', original, fs);
    expect(writeResult.ok).toBe(true);

    const readResult = readYaml<typeof original>('/round.yaml', fs);
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value).toEqual(original);
    }
  });
});

describe('createRealFs - writeFileAtomic', () => {
  let tmpDir: string;
  const realFs = createRealFs();

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'agentforge-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new file atomically', () => {
    const filePath = join(tmpDir, 'new-file.txt');

    const result = realFs.writeFileAtomic(filePath, 'hello atomic');
    expect(result.ok).toBe(true);
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('hello atomic');
  });

  it('replaces an existing file atomically', () => {
    const filePath = join(tmpDir, 'existing.txt');
    realFs.writeFile(filePath, 'original content');

    const result = realFs.writeFileAtomic(filePath, 'updated content');
    expect(result.ok).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('updated content');
  });

  it('leaves no .tmp file after atomic write', () => {
    const filePath = join(tmpDir, 'clean.txt');

    realFs.writeFileAtomic(filePath, 'content');

    const entries = readdirSync(tmpDir);
    const tmpFiles = entries.filter((e) => e.includes('.tmp.'));
    expect(tmpFiles).toHaveLength(0);
  });
});
