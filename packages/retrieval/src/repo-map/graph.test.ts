import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFile } from './parser.js';
import { buildSymbolGraph } from './graph.js';

const FIXTURES = join(__dirname, '__fixtures__');

function loadFixture(name: string, filePath: string) {
  const content = readFileSync(join(FIXTURES, name), 'utf-8');
  const result = parseFile(filePath, content, 'typescript');
  if (!result.ok) throw new Error(`Failed to parse ${name}: ${result.error.message}`);
  return result.value;
}

describe('buildSymbolGraph', () => {
  it('creates edges from importer to imported symbols', () => {
    const files = [
      loadFixture('module-a.ts.fixture', 'src/module-a.ts'),
      loadFixture('math-utils.ts.fixture', 'src/math-utils.ts'),
      loadFixture('config.ts.fixture', 'src/config.ts'),
      loadFixture('service.ts.fixture', 'src/service.ts'),
    ];

    const graph = buildSymbolGraph(files);

    expect(graph.nodes.size).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);

    // `add` is imported by both module-a and service → higher in-degree than `formatNumber`
    const addNode = graph.nodes.get('src/math-utils.ts::add');
    const formatNode = graph.nodes.get('src/math-utils.ts::formatNumber');

    expect(addNode).toBeDefined();
    expect(formatNode).toBeDefined();
    expect(addNode!.inDegree).toBeGreaterThan(0);
    expect(formatNode!.inDegree).toBe(0);
  });

  it('handles empty file list', () => {
    const graph = buildSymbolGraph([]);
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.length).toBe(0);
  });
});
