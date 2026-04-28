import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildMerkleTree, diffMerkleTrees, saveMerkleTree, loadMerkleTree } from './merkle-tree.js';

describe('buildMerkleTree', () => {
  it('produces consistent hashes for same content', () => {
    const entries = new Map([
      ['a.ts', 'const a = 1;'],
      ['b.ts', 'const b = 2;'],
    ]);

    const tree1 = buildMerkleTree(entries);
    const tree2 = buildMerkleTree(entries);

    expect(tree1.rootHash).toBe(tree2.rootHash);
    expect(tree1.nodes.get('a.ts')).toBe(tree2.nodes.get('a.ts'));
  });

  it('produces different root hash when content changes', () => {
    const tree1 = buildMerkleTree(new Map([['a.ts', 'version 1']]));
    const tree2 = buildMerkleTree(new Map([['a.ts', 'version 2']]));

    expect(tree1.rootHash).not.toBe(tree2.rootHash);
  });
});

describe('diffMerkleTrees', () => {
  it('detects added files', () => {
    const prev = buildMerkleTree(new Map([['a.ts', 'a']]));
    const curr = buildMerkleTree(new Map([['a.ts', 'a'], ['b.ts', 'b']]));

    const changes = diffMerkleTrees(prev, curr);
    expect(changes).toContainEqual({ path: 'b.ts', type: 'added' });
  });

  it('detects modified files', () => {
    const prev = buildMerkleTree(new Map([['a.ts', 'v1']]));
    const curr = buildMerkleTree(new Map([['a.ts', 'v2']]));

    const changes = diffMerkleTrees(prev, curr);
    expect(changes).toContainEqual({ path: 'a.ts', type: 'modified' });
  });

  it('detects deleted files', () => {
    const prev = buildMerkleTree(new Map([['a.ts', 'a'], ['b.ts', 'b']]));
    const curr = buildMerkleTree(new Map([['a.ts', 'a']]));

    const changes = diffMerkleTrees(prev, curr);
    expect(changes).toContainEqual({ path: 'b.ts', type: 'deleted' });
  });

  it('returns empty for identical trees', () => {
    const tree = buildMerkleTree(new Map([['a.ts', 'a']]));
    const changes = diffMerkleTrees(tree, tree);
    expect(changes).toHaveLength(0);
  });
});

describe('save/loadMerkleTree', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'merkle-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips a Merkle tree through JSON', async () => {
    const tree = buildMerkleTree(new Map([['x.ts', 'hello'], ['y.ts', 'world']]));
    const jsonPath = join(tmpDir, 'merkle.json');

    await saveMerkleTree(tree, jsonPath);

    const raw = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.rootHash).toBe(tree.rootHash);

    const loaded = await loadMerkleTree(jsonPath);
    expect(loaded.rootHash).toBe(tree.rootHash);
    expect(loaded.nodes.get('x.ts')).toBe(tree.nodes.get('x.ts'));
  });

  it('returns empty tree for missing file', async () => {
    const loaded = await loadMerkleTree(join(tmpDir, 'nonexistent.json'));
    expect(loaded.nodes.size).toBe(0);
    expect(loaded.rootHash).toBe('');
  });
});
