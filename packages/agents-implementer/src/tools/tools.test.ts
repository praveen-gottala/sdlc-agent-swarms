/**
 * Tests for the v1 Implementer tool set — verifies tool execution,
 * security boundaries, and error handling.
 */

import { executeImplementerTool, IMPLEMENTER_TOOLS } from './index.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('IMPLEMENTER_TOOLS', () => {
  it('exports 7 tools', () => {
    expect(IMPLEMENTER_TOOLS).toHaveLength(7);
  });

  it('each tool has name, description, and parameters', () => {
    for (const tool of IMPLEMENTER_TOOLS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });
});

describe('read_file', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tool-test-'));
    writeFileSync(join(tempDir, 'test.txt'), 'hello world');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reads a file within project root', async () => {
    const result = await executeImplementerTool('read_file', { path: 'test.txt' }, tempDir);
    expect(result).toBe('hello world');
  });

  it('rejects path traversal', async () => {
    const result = await executeImplementerTool('read_file', { path: '../../../etc/passwd' }, tempDir);
    expect(result).toContain('Error');
  });

  it('returns error for missing files', async () => {
    const result = await executeImplementerTool('read_file', { path: 'nonexistent.txt' }, tempDir);
    expect(result).toContain('Error');
  });
});

describe('write_file', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tool-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes a file and creates directories', async () => {
    const result = await executeImplementerTool(
      'write_file',
      { path: 'src/deep/file.ts', contents: 'export const x = 1;' },
      tempDir,
    );
    expect(result).toContain('File written');
    expect(readFileSync(join(tempDir, 'src/deep/file.ts'), 'utf-8')).toBe('export const x = 1;');
  });

  it('rejects path traversal', async () => {
    const result = await executeImplementerTool(
      'write_file',
      { path: '../../evil.ts', contents: 'bad' },
      tempDir,
    );
    expect(result).toContain('Error');
  });
});

describe('apply_patch', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tool-test-'));
    writeFileSync(join(tempDir, 'file.ts'), 'line1\nline2\nline3\n');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('applies a simple patch', async () => {
    const patch = `@@ -1,3 +1,3 @@
 line1
-line2
+line2_modified
 line3
`;
    const result = await executeImplementerTool('apply_patch', { path: 'file.ts', patch }, tempDir);
    expect(result).toContain('Patch applied');
    expect(readFileSync(join(tempDir, 'file.ts'), 'utf-8')).toContain('line2_modified');
  });
});

describe('report_assumption_violation', () => {
  it('returns acknowledgment', async () => {
    const result = await executeImplementerTool(
      'report_assumption_violation',
      { assumptionId: 'A1', evidence: 'Found conflicting pattern' },
      '/tmp',
    );
    expect(result).toContain('Assumption violation recorded');
    expect(result).toContain('A1');
  });
});

describe('unknown tool', () => {
  it('returns error for unknown tool name', async () => {
    const result = await executeImplementerTool('nonexistent_tool', {}, '/tmp');
    expect(result).toContain('unknown tool');
  });
});
