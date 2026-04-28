/**
 * Scope: design-indexer.ts — Merkle-diff-based design spec indexing.
 * Mocks: fs, Voyage client, Qdrant client, Merkle tree persistence.
 * Canonical test for design indexing lives here, not in tools/ or CLI.
 */

import { indexDesigns, type DesignIndexerOptions } from './design-indexer.js';
import type { VoyageClient } from '../clients/voyage-client.js';
import type { QdrantClientWrapper } from '../clients/qdrant-client.js';
// VoyageClient and QdrantClientWrapper used for mock typing

// Mock fs
jest.mock('node:fs/promises', () => ({
  readdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

// Mock merkle-tree to control diff results
jest.mock('./merkle-tree.js', () => ({
  loadMerkleTree: jest.fn().mockResolvedValue(new Map()),
  buildMerkleTree: jest.fn().mockReturnValue(new Map()),
  diffMerkleTrees: jest.fn().mockReturnValue([]),
  saveMerkleTree: jest.fn().mockResolvedValue(undefined),
}));

import { readdir, readFile } from 'node:fs/promises';
import { diffMerkleTrees, buildMerkleTree } from './merkle-tree.js';

function makeMockVoyage(): VoyageClient {
  return {
    embedCode: jest.fn(),
    embedDocs: jest.fn().mockResolvedValue({
      ok: true as const,
      value: { embeddings: [[0.1, 0.2, 0.3]], model: 'voyage-3-large', totalTokens: 10 },
    }),
  };
}

function makeMockQdrant(): QdrantClientWrapper {
  return {
    ensureCollection: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    upsertPoints: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    hybridSearch: jest.fn(),
    deleteByFilter: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    healthCheck: jest.fn().mockResolvedValue({ ok: true, value: true }),
  };
}

const baseOptions: DesignIndexerOptions = {
  rootDir: '/project/agentforge/designs',
  projectId: 'test-project',
  designsCollection: 'agentforge_designs',
  merkleTreePath: '/project/.agentforge/retrieval/merkle-tree-designs.json',
};

describe('indexDesigns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readdir as jest.Mock).mockResolvedValue([]);
    (readFile as jest.Mock).mockResolvedValue('{}');
  });

  it('returns early when no files changed', async () => {
    (diffMerkleTrees as jest.Mock).mockReturnValue([]);

    const result = await indexDesigns(baseOptions, makeMockVoyage(), makeMockQdrant());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filesProcessed).toBe(0);
    expect(result.value.chunksCreated).toBe(0);
    expect(result.value.pointsUpserted).toBe(0);
  });

  it('indexes added design files with correct screenId from filename', async () => {
    const spec = JSON.stringify({
      designSpec: {
        nodes: {
          'n1': { type: 'container', catalog: 'Card' },
          'n2': { type: 'text', content: 'Hello' },
        },
      },
    });

    (readdir as jest.Mock).mockResolvedValue([
      { name: 'dashboard.json', isDirectory: () => false, isFile: () => true },
    ]);
    (readFile as jest.Mock).mockResolvedValue(spec);

    const currentFiles = new Map([['/project/agentforge/designs/dashboard.json', spec]]);
    (buildMerkleTree as jest.Mock).mockReturnValue(currentFiles);
    (diffMerkleTrees as jest.Mock).mockReturnValue([
      { path: '/project/agentforge/designs/dashboard.json', type: 'added' },
    ]);

    const voyage = makeMockVoyage();
    (voyage.embedDocs as jest.Mock).mockResolvedValue({
      ok: true,
      value: { embeddings: [[0.1, 0.2], [0.3, 0.4]], model: 'voyage-3-large', totalTokens: 20 },
    });

    const qdrant = makeMockQdrant();
    const result = await indexDesigns(baseOptions, voyage, qdrant);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.chunksCreated).toBe(2);
    expect(result.value.pointsUpserted).toBe(2);
    expect(voyage.embedDocs).toHaveBeenCalled();
    expect(qdrant.upsertPoints).toHaveBeenCalledWith('agentforge_designs', expect.any(Array));

    const points = (qdrant.upsertPoints as jest.Mock).mock.calls[0][1];
    expect(points[0].payload.screenId).toBe('dashboard');
    expect(points[0].payload.projectId).toBe('test-project');
  });

  it('skips directories with __ prefix', async () => {
    (readdir as jest.Mock).mockImplementation((dir: string) => {
      if (dir === '/project/agentforge/designs') {
        return Promise.resolve([
          { name: '__shared-chrome__', isDirectory: () => true, isFile: () => false },
          { name: 'settings.json', isDirectory: () => false, isFile: () => true },
        ]);
      }
      return Promise.resolve([]);
    });
    (readFile as jest.Mock).mockResolvedValue('{}');

    const files = new Map([['/project/agentforge/designs/settings.json', '{}']]);
    (buildMerkleTree as jest.Mock).mockReturnValue(files);
    (diffMerkleTrees as jest.Mock).mockReturnValue([
      { path: '/project/agentforge/designs/settings.json', type: 'added' },
    ]);

    const result = await indexDesigns(baseOptions, makeMockVoyage(), makeMockQdrant());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.filesProcessed).toBe(1);
  });

  it('deletes modified/deleted files from Qdrant before re-indexing', async () => {
    (diffMerkleTrees as jest.Mock).mockReturnValue([
      { path: '/project/designs/old.json', type: 'deleted' },
      { path: '/project/designs/modified.json', type: 'modified' },
    ]);

    const content = JSON.stringify({ nodes: { n1: { type: 'text' } } });
    (readdir as jest.Mock).mockResolvedValue([]);
    (readFile as jest.Mock).mockResolvedValue(content);
    const files = new Map([['/project/designs/modified.json', content]]);
    (buildMerkleTree as jest.Mock).mockReturnValue(files);

    const qdrant = makeMockQdrant();
    await indexDesigns(baseOptions, makeMockVoyage(), qdrant);

    expect(qdrant.deleteByFilter).toHaveBeenCalledTimes(2);
  });
});
