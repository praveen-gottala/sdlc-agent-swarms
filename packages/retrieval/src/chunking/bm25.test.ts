import { tokenize, buildVocabulary, computeBM25Sparse } from './bm25.js';

describe('tokenize', () => {
  it('splits camelCase into components', () => {
    expect(tokenize('parseYamlConfig')).toEqual(['parse', 'yaml', 'config']);
  });

  it('splits on common delimiters', () => {
    expect(tokenize('foo_bar-baz.ts')).toEqual(['foo', 'bar', 'baz', 'ts']);
  });

  it('filters short tokens', () => {
    expect(tokenize('a b cc ddd')).toEqual(['cc', 'ddd']);
  });

  it('lowercases all tokens', () => {
    expect(tokenize('XMLParser')).toEqual(['xml', 'parser']);
  });
});

describe('buildVocabulary', () => {
  it('computes IDF from corpus', () => {
    const corpus = [
      tokenize('function add(a, b) { return a + b; }'),
      tokenize('function multiply(a, b) { return a * b; }'),
      tokenize('export const result = add(1, multiply(2, 3));'),
    ];

    const vocab = buildVocabulary(corpus);

    expect(vocab.docCount).toBe(3);
    expect(vocab.avgDocLength).toBeGreaterThan(0);
    expect(vocab.termToIndex.size).toBeGreaterThan(0);

    // "add" appears in 2 docs, "multiply" appears in 2 docs, "result" appears in 1
    // IDF of "result" should be higher than "add"
    const idfAdd = vocab.idf.get('add')!;
    const idfResult = vocab.idf.get('result')!;
    expect(idfResult).toBeGreaterThan(idfAdd);
  });
});

describe('computeBM25Sparse', () => {
  it('produces non-empty sparse vector for known terms', () => {
    const corpus = [
      tokenize('function parseConfig(data: string): Config'),
      tokenize('function readFile(path: string): Promise<string>'),
    ];
    const vocab = buildVocabulary(corpus);

    const sparse = computeBM25Sparse(corpus[0]!, vocab);

    expect(sparse.indices.length).toBeGreaterThan(0);
    expect(sparse.values.length).toBe(sparse.indices.length);
    expect(sparse.values.every(v => v > 0)).toBe(true);
  });

  it('returns empty for unknown terms', () => {
    const corpus = [tokenize('hello world')];
    const vocab = buildVocabulary(corpus);

    const sparse = computeBM25Sparse(tokenize('completely unrelated xyz'), vocab);
    expect(sparse.indices.length).toBe(0);
  });
});
