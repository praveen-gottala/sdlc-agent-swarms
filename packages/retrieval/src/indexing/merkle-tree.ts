/**
 * @module @agentforge/retrieval/indexing/merkle-tree
 *
 * Content-addressable Merkle tree for incremental indexing.
 * Stores SHA-256 hashes per file, detects which files changed since
 * last index run.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export interface MerkleNode {
  readonly path: string;
  readonly hash: string;
}

export interface MerkleTree {
  readonly nodes: ReadonlyMap<string, string>;
  readonly rootHash: string;
}

export interface FileChange {
  readonly path: string;
  readonly type: 'added' | 'modified' | 'deleted';
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Build a Merkle tree from file path→content entries. */
export function buildMerkleTree(entries: ReadonlyMap<string, string>): MerkleTree {
  const nodes = new Map<string, string>();
  const hashes: string[] = [];

  const sorted = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [path, content] of sorted) {
    const hash = hashContent(content);
    nodes.set(path, hash);
    hashes.push(`${path}:${hash}`);
  }

  const rootHash = hashContent(hashes.join('\n'));
  return { nodes, rootHash };
}

/** Diff two Merkle trees to find changed files. */
export function diffMerkleTrees(prev: MerkleTree, curr: MerkleTree): readonly FileChange[] {
  const changes: FileChange[] = [];

  for (const [path, hash] of curr.nodes) {
    const prevHash = prev.nodes.get(path);
    if (!prevHash) {
      changes.push({ path, type: 'added' });
    } else if (prevHash !== hash) {
      changes.push({ path, type: 'modified' });
    }
  }

  for (const [path] of prev.nodes) {
    if (!curr.nodes.has(path)) {
      changes.push({ path, type: 'deleted' });
    }
  }

  return changes;
}

/** Load a persisted Merkle tree from disk. Returns empty tree if file doesn't exist. */
export async function loadMerkleTree(jsonPath: string): Promise<MerkleTree> {
  try {
    const raw = await readFile(jsonPath, 'utf-8');
    const data = JSON.parse(raw) as { nodes: Record<string, string>; rootHash: string };
    return { nodes: new Map(Object.entries(data.nodes)), rootHash: data.rootHash };
  } catch {
    return { nodes: new Map(), rootHash: '' };
  }
}

/** Persist a Merkle tree to disk. */
export async function saveMerkleTree(tree: MerkleTree, jsonPath: string): Promise<void> {
  await mkdir(dirname(jsonPath), { recursive: true });
  const data = {
    nodes: Object.fromEntries(tree.nodes),
    rootHash: tree.rootHash,
  };
  await writeFile(jsonPath, JSON.stringify(data, null, 2));
}
