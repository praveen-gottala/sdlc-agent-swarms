import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from './parser.js';
import { buildSymbolGraph } from './graph.js';
import { personalizedPageRank } from './pagerank.js';

const FIXTURES = join(__dirname, '__fixtures__');

function loadFixture(name: string, filePath: string) {
  const content = readFileSync(join(FIXTURES, name), 'utf-8');
  const result = parseFile(filePath, content, 'typescript');
  if (!result.ok) throw new Error(`Failed to parse ${name}`);
  return result.value;
}

describe('personalizedPageRank', () => {
  it('ranks multiply-referenced symbols higher', () => {
    const files = [
      loadFixture('module-a.ts.fixture', 'src/module-a.ts'),
      loadFixture('math-utils.ts.fixture', 'src/math-utils.ts'),
      loadFixture('config.ts.fixture', 'src/config.ts'),
      loadFixture('service.ts.fixture', 'src/service.ts'),
    ];

    const graph = buildSymbolGraph(files);
    const ranked = personalizedPageRank(graph);

    expect(ranked.length).toBeGreaterThan(0);

    // `add` is referenced by 2 files, `formatNumber` by 0
    const addRank = ranked.findIndex(r => r.node.symbol.name === 'add');
    const formatRank = ranked.findIndex(r => r.node.symbol.name === 'formatNumber');

    expect(addRank).toBeLessThan(formatRank);
  });

  it('personalizes with seed files', () => {
    const files = [
      loadFixture('module-a.ts.fixture', 'src/module-a.ts'),
      loadFixture('math-utils.ts.fixture', 'src/math-utils.ts'),
      loadFixture('config.ts.fixture', 'src/config.ts'),
    ];

    const graph = buildSymbolGraph(files);
    const rankedDefault = personalizedPageRank(graph);
    const rankedSeeded = personalizedPageRank(graph, { seedFiles: ['src/config.ts'] });

    const configRankDefault = rankedDefault.findIndex(r => r.node.filePath === 'src/config.ts');
    const configRankSeeded = rankedSeeded.findIndex(r => r.node.filePath === 'src/config.ts');

    // Seeded config symbols should rank higher (or equal) compared to default
    expect(configRankSeeded).toBeLessThanOrEqual(configRankDefault);
  });

  it('handles empty graph', () => {
    const ranked = personalizedPageRank({ nodes: new Map(), edges: [] });
    expect(ranked).toEqual([]);
  });
});
