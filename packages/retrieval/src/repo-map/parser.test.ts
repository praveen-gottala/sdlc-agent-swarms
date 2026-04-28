import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile, detectLanguage } from './parser.js';

const FIXTURES = join(__dirname, '__fixtures__');

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

describe('parseFile', () => {
  it('extracts functions, classes, methods, interfaces, and imports from module-a', () => {
    const content = loadFixture('module-a.ts.fixture');
    const result = parseFile('src/module-a.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const names = result.value.symbols.map(s => s.name);
    expect(names).toContain('AppState');
    expect(names).toContain('initialize');
    expect(names).toContain('AppController');
    expect(names).toContain('getCount');
    expect(names).toContain('increment');

    const initFn = result.value.symbols.find(s => s.name === 'initialize');
    expect(initFn?.kind).toBe('function');
    expect(initFn?.exported).toBe(true);
    expect(initFn?.signature).toContain('config: Config');

    const controller = result.value.symbols.find(s => s.name === 'AppController');
    expect(controller?.kind).toBe('class');
    expect(controller?.exported).toBe(true);

    const getCount = result.value.symbols.find(s => s.name === 'getCount');
    expect(getCount?.kind).toBe('method');

    expect(result.value.imports).toHaveLength(2);
    expect(result.value.imports[0]!.source).toBe('./math-utils.js');
    expect(result.value.imports[0]!.specifiers).toEqual(['add', 'multiply']);
  });

  it('extracts standalone functions from math-utils', () => {
    const content = loadFixture('math-utils.ts.fixture');
    const result = parseFile('src/math-utils.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.symbols).toHaveLength(3);
    expect(result.value.symbols.map(s => s.name)).toEqual(['add', 'multiply', 'formatNumber']);
    expect(result.value.symbols.every(s => s.exported)).toBe(true);
    expect(result.value.symbols.every(s => s.kind === 'function')).toBe(true);
  });

  it('extracts interfaces, type aliases, and const from config', () => {
    const content = loadFixture('config.ts.fixture');
    const result = parseFile('src/config.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const kinds = result.value.symbols.map(s => ({ name: s.name, kind: s.kind }));
    expect(kinds).toContainEqual({ name: 'Config', kind: 'interface' });
    expect(kinds).toContainEqual({ name: 'Environment', kind: 'type' });
  });

  it('extracts type aliases and enums from types fixture', () => {
    const content = loadFixture('types.ts.fixture');
    const result = parseFile('src/types.ts', content, 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const names = result.value.symbols.map(s => s.name);
    expect(names).toContain('Result');
    expect(names).toContain('Ok');
    expect(names).toContain('Err');
    expect(names).toContain('Status');

    const statusEnum = result.value.symbols.find(s => s.name === 'Status');
    expect(statusEnum?.kind).toBe('enum');
  });

  it('rejects unsupported languages', () => {
    const result = parseFile('test.py', 'def foo(): pass', 'python');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('TREESITTER_PARSE_ERROR');
  });
});

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript');
    expect(detectLanguage('foo.tsx')).toBe('typescript');
  });

  it('detects JavaScript', () => {
    expect(detectLanguage('foo.js')).toBe('javascript');
    expect(detectLanguage('foo.jsx')).toBe('javascript');
    expect(detectLanguage('foo.mjs')).toBe('javascript');
    expect(detectLanguage('foo.cjs')).toBe('javascript');
  });

  it('returns undefined for unknown', () => {
    expect(detectLanguage('foo.py')).toBeUndefined();
    expect(detectLanguage('foo.rs')).toBeUndefined();
  });
});
