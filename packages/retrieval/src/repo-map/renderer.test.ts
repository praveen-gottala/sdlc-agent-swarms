import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from './parser.js';
import { buildSymbolGraph } from './graph.js';
import { personalizedPageRank } from './pagerank.js';
import { renderRepoMap } from './renderer.js';

const FIXTURES = join(__dirname, '__fixtures__');

function loadFixture(name: string, filePath: string) {
  const content = readFileSync(join(FIXTURES, name), 'utf-8');
  const result = parseFile(filePath, content, 'typescript');
  if (!result.ok) throw new Error(`Failed to parse ${name}`);
  return result.value;
}

describe('renderRepoMap', () => {
  it('produces grouped output with file headers and symbol lines', () => {
    const files = [
      loadFixture('module-a.ts.fixture', 'src/module-a.ts'),
      loadFixture('math-utils.ts.fixture', 'src/math-utils.ts'),
      loadFixture('config.ts.fixture', 'src/config.ts'),
    ];

    const graph = buildSymbolGraph(files);
    const ranked = personalizedPageRank(graph);
    const output = renderRepoMap(ranked);

    expect(output).toContain('src/');
    expect(output).toContain('function');
    expect(output).toContain('add');
    expect(output.length).toBeGreaterThan(0);
  });

  it('respects token budget', () => {
    const files = [
      loadFixture('module-a.ts.fixture', 'src/module-a.ts'),
      loadFixture('math-utils.ts.fixture', 'src/math-utils.ts'),
      loadFixture('config.ts.fixture', 'src/config.ts'),
      loadFixture('service.ts.fixture', 'src/service.ts'),
      loadFixture('types.ts.fixture', 'src/types.ts'),
    ];

    const graph = buildSymbolGraph(files);
    const ranked = personalizedPageRank(graph);

    const smallOutput = renderRepoMap(ranked, { tokenBudget: 50 });
    const largeOutput = renderRepoMap(ranked, { tokenBudget: 4096 });

    expect(smallOutput.length).toBeLessThan(largeOutput.length);
    // Small budget should not exceed ~200 chars (50 tokens * 4 chars/token)
    expect(smallOutput.length).toBeLessThanOrEqual(250);
  });

  it('handles empty ranked list', () => {
    const output = renderRepoMap([]);
    expect(output).toBe('');
  });
});
