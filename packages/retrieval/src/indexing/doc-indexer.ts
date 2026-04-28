/**
 * @module @agentforge/retrieval/indexing/doc-indexer
 *
 * Indexes markdown and YAML documents into Qdrant with Voyage embeddings.
 * Uses Merkle tree for incremental indexing.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { chunkDocument } from '../chunking/doc-chunker.js';
import { tokenize, buildVocabulary, computeBM25Sparse } from '../chunking/bm25.js';
import { buildMerkleTree, diffMerkleTrees, loadMerkleTree, saveMerkleTree } from './merkle-tree.js';
import type { VoyageClient } from '../clients/voyage-client.js';
import type { QdrantClientWrapper, QdrantPoint } from '../clients/qdrant-client.js';
import type { DocChunk, IndexResult, RetrievalError } from '../types.js';

export interface DocIndexerOptions {
  readonly rootDir: string;
  readonly projectId: string;
  readonly docsCollection: string;
  readonly merkleTreePath: string;
  readonly extensions?: readonly string[];
  readonly exclude?: readonly string[];
  readonly batchSize?: number;
}

const DEFAULT_EXTENSIONS = ['.md', '.yaml', '.yml', '.txt'];
const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.next', 'coverage'];

async function scanDocFiles(dir: string, extensions: readonly string[], exclude: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (exclude.some(e => entry.name === e)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        const content = await readFile(full, 'utf-8');
        files.set(full, content);
      }
    }
  }

  await walk(dir);
  return files;
}

/** Index documents into Qdrant. */
export async function indexDocuments(
  options: DocIndexerOptions,
  voyage: VoyageClient,
  qdrant: QdrantClientWrapper,
): Promise<Result<IndexResult, RetrievalError>> {
  const start = Date.now();
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];
  const batchSize = options.batchSize ?? 64;
  const errors: RetrievalError[] = [];

  try {
    const prevTree = await loadMerkleTree(options.merkleTreePath);
    const currentFiles = await scanDocFiles(options.rootDir, extensions, exclude);
    const currTree = buildMerkleTree(currentFiles);
    const changes = diffMerkleTrees(prevTree, currTree);

    if (changes.length === 0) {
      return Ok({ filesProcessed: 0, chunksCreated: 0, pointsUpserted: 0, errors: [], durationMs: Date.now() - start });
    }

    const deletePaths = changes.filter(c => c.type === 'deleted' || c.type === 'modified').map(c => c.path);
    for (const path of deletePaths) {
      await qdrant.deleteByFilter(options.docsCollection, {
        must: [
          { key: 'filePath', match: { value: path } },
          { key: 'projectId', match: { value: options.projectId } },
        ],
      });
    }

    const filesToIndex = changes.filter(c => c.type === 'added' || c.type === 'modified');
    const allChunks: DocChunk[] = [];

    for (const change of filesToIndex) {
      const content = currentFiles.get(change.path);
      if (!content) continue;
      const chunkResult = chunkDocument(change.path, content);
      if (chunkResult.ok) allChunks.push(...chunkResult.value);
      else errors.push(chunkResult.error);
    }

    if (allChunks.length === 0) {
      await saveMerkleTree(currTree, options.merkleTreePath);
      return Ok({ filesProcessed: filesToIndex.length, chunksCreated: 0, pointsUpserted: 0, errors, durationMs: Date.now() - start });
    }

    const tokenizedChunks = allChunks.map(c => tokenize(c.content));
    const vocab = buildVocabulary(tokenizedChunks);

    let totalUpserted = 0;

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const batchTokens = tokenizedChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);

      const embedResult = await voyage.embedDocs(texts);
      if (!embedResult.ok) { errors.push(embedResult.error); continue; }

      const points: QdrantPoint[] = batch.map((chunk, j) => {
        const sparse = computeBM25Sparse(batchTokens[j]!, vocab);
        return {
          id: createHash('sha256').update(`${options.projectId}:${chunk.filePath}:${chunk.heading ?? j}`).digest('hex').slice(0, 32),
          vector: { dense: embedResult.value.embeddings[j]! as number[], sparse },
          payload: {
            filePath: chunk.filePath,
            heading: chunk.heading ?? '',
            headingLevel: chunk.headingLevel ?? 0,
            docType: chunk.docType,
            content: chunk.content,
            contentHash: chunk.contentHash,
            projectId: options.projectId,
          },
        };
      });

      const upsertResult = await qdrant.upsertPoints(options.docsCollection, points);
      if (!upsertResult.ok) { errors.push(upsertResult.error); continue; }
      totalUpserted += points.length;
    }

    await saveMerkleTree(currTree, options.merkleTreePath);
    return Ok({ filesProcessed: filesToIndex.length, chunksCreated: allChunks.length, pointsUpserted: totalUpserted, errors, durationMs: Date.now() - start });
  } catch (e: unknown) {
    return Err({ code: 'INDEXING_PARTIAL_FAILURE', message: e instanceof Error ? e.message : String(e), recoverable: true });
  }
}
