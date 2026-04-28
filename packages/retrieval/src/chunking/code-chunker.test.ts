import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chunkCodeFile } from './code-chunker.js';

const FIXTURES = join(__dirname, '../repo-map/__fixtures__');

describe('chunkCodeFile', () => {
  it('chunks a file with multiple symbols', () => {
    const content = readFileSync(join(FIXTURES, 'math-utils.ts.fixture'), 'utf-8');
    const result = chunkCodeFile('src/math-utils.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThan(0);
    for (const chunk of result.value) {
      expect(chunk.filePath).toBe('src/math-utils.ts');
      expect(chunk.language).toBe('typescript');
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.contentHash).toHaveLength(16);
    }
  });

  it('produces content hashes that change with content', () => {
    const content1 = 'export function foo(): void { console.log("a"); }';
    const content2 = 'export function foo(): void { console.log("b"); }';

    const result1 = chunkCodeFile('a.ts', content1, 'typescript');
    const result2 = chunkCodeFile('b.ts', content2, 'typescript');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value[0]!.contentHash).not.toBe(result2.value[0]!.contentHash);
  });

  it('handles a file with a class containing methods', () => {
    const content = readFileSync(join(FIXTURES, 'module-a.ts.fixture'), 'utf-8');
    const result = chunkCodeFile('src/module-a.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThanOrEqual(1);
    const allContent = result.value.map(c => c.content).join('\n');
    expect(allContent).toContain('AppController');
    expect(allContent).toContain('initialize');
  });

  it('rejects unknown language', () => {
    const result = chunkCodeFile('test.py', 'def foo(): pass');
    expect(result.ok).toBe(false);
  });

  it('handles empty file', () => {
    const result = chunkCodeFile('empty.ts', '', 'typescript');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });
});
