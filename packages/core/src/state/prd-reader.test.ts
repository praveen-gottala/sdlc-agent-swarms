import { loadPRD, prdExists } from './prd-reader.js';
import type { FileSystem } from '../fs/file-system.js';

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

describe('loadPRD', () => {
  it('returns PRD content when file exists', () => {
    const fs = createMockFs();
    const prdContent = '# My App PRD\n\nThis is a test PRD.';
    fs.files.set('/project/docs/prd.md', prdContent);

    const result = loadPRD('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(prdContent);
    }
  });

  it('returns Err with actionable message when file is missing', () => {
    const fs = createMockFs();

    const result = loadPRD('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('agentforge describe');
      expect(result.error.message).toContain('docs/prd.md');
      expect(result.error.recoverable).toBe(true);
    }
  });
});

describe('prdExists', () => {
  it('returns true when PRD file exists', () => {
    const fs = createMockFs();
    fs.files.set('/project/docs/prd.md', '# PRD');

    expect(prdExists('/project', fs)).toBe(true);
  });

  it('returns false when PRD file is missing', () => {
    const fs = createMockFs();

    expect(prdExists('/project', fs)).toBe(false);
  });
});
