import { join } from 'node:path';
import { generateRepoMap } from './repo-map.js';

describe('generateRepoMap', () => {
  it('generates a meaningful map from fixture files', async () => {
    // Fixture files have .ts.fixture extension — won't be found by default scanner.
    // Instead, test on the repo-map source directory itself.
    const result = await generateRepoMap({
      rootDir: join(__dirname),
      tokenBudget: 2048,
      exclude: ['__fixtures__', '.test.'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toContain('parser.ts');
    expect(result.value).toContain('function');
    expect(result.value.length).toBeGreaterThan(100);
  });

  it('returns message for empty directory', async () => {
    const result = await generateRepoMap({
      rootDir: join(__dirname, '__fixtures__'),
      tokenBudget: 1024,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Fixture files have .ts.fixture extension, not .ts — should find nothing
    expect(result.value).toBe('(no parseable files found)');
  });

  it('respects token budget', async () => {
    const small = await generateRepoMap({ rootDir: __dirname, tokenBudget: 100, exclude: ['__fixtures__', '.test.'] });
    const large = await generateRepoMap({ rootDir: __dirname, tokenBudget: 4096, exclude: ['__fixtures__', '.test.'] });

    expect(small.ok).toBe(true);
    expect(large.ok).toBe(true);
    if (!small.ok || !large.ok) return;

    expect(small.value.length).toBeLessThan(large.value.length);
  });
});
