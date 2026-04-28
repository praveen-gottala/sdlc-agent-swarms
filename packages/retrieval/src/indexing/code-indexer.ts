/**
 * @module @agentforge/retrieval/indexing/code-indexer
 *
 * Indexes codebase into Qdrant with dense (Voyage) + sparse (BM25) vectors.
 * Uses Merkle tree for incremental indexing — only re-indexes changed files.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { detectLanguage } from '../repo-map/parser.js';
import { chunkCodeFile } from '../chunking/code-chunker.js';
import { tokenize, buildVocabulary, computeBM25Sparse } from '../chunking/bm25.js';
import { buildMerkleTree, diffMerkleTrees, loadMerkleTree, saveMerkleTree } from './merkle-tree.js';
import type { VoyageClient } from '../clients/voyage-client.js';
import type { QdrantClientWrapper, QdrantPoint } from '../clients/qdrant-client.js';
import type { CodeChunk, IndexResult, RetrievalError } from '../types.js';

export interface CodeIndexerOptions {
  readonly rootDir: string;
  readonly projectId: string;
  readonly codeCollection: string;
  readonly merkleTreePath: string;
  readonly exclude?: readonly string[];
  readonly batchSize?: number;
}

const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.next', '__pycache__', '.tsbuildinfo', 'coverage'];

async function scanFiles(dir: string, exclude: readonly string[]): Promise<Map<string, string>> {
  const files = new Map<string, string>();

  async function walk(d: string): Promise<void> {
    const entries = await readdir(d, { withFileTypes: true });
    for (const entry of entries) {
      if (exclude.some(e => entry.name === e)) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && detectLanguage(entry.name)) {
        const content = await readFile(full, 'utf-8');
        files.set(full, content);
      }
    }
  }

  await walk(dir);
  return files;
}

/** Index a codebase into Qdrant. Incremental via Merkle tree diff. */
export async function indexCodebase(
  options: CodeIndexerOptions,
  voyage: VoyageClient,
  qdrant: QdrantClientWrapper,
): Promise<Result<IndexResult, RetrievalError>> {
  const start = Date.now();
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];
  const batchSize = options.batchSize ?? 64;
  const errors: RetrievalError[] = [];

  try {
    // Load previous Merkle tree
    const prevTree = await loadMerkleTree(options.merkleTreePath);

    // Scan current files
    const currentFiles = await scanFiles(options.rootDir, exclude);
    const currTree = buildMerkleTree(currentFiles);

    // Diff to find changes
    const changes = diffMerkleTrees(prevTree, currTree);

    if (changes.length === 0) {
      return Ok({
        filesProcessed: 0,
        chunksCreated: 0,
        pointsUpserted: 0,
        errors: [],
        durationMs: Date.now() - start,
      });
    }

    // Delete removed/modified files from Qdrant
    const deletePaths = changes.filter(c => c.type === 'deleted' || c.type === 'modified').map(c => c.path);
    if (deletePaths.length > 0) {
      for (const path of deletePaths) {
        await qdrant.deleteByFilter(options.codeCollection, {
          must: [
            { key: 'filePath', match: { value: path } },
            { key: 'projectId', match: { value: options.projectId } },
          ],
        });
      }
    }

    // Chunk added/modified files
    const filesToIndex = changes.filter(c => c.type === 'added' || c.type === 'modified');
    const allChunks: CodeChunk[] = [];

    for (const change of filesToIndex) {
      const content = currentFiles.get(change.path);
      if (!content) continue;

      const chunkResult = chunkCodeFile(change.path, content);
      if (chunkResult.ok) {
        allChunks.push(...chunkResult.value);
      } else {
        errors.push(chunkResult.error);
      }
    }

    if (allChunks.length === 0) {
      await saveMerkleTree(currTree, options.merkleTreePath);
      return Ok({
        filesProcessed: filesToIndex.length,
        chunksCreated: 0,
        pointsUpserted: 0,
        errors,
        durationMs: Date.now() - start,
      });
    }

    // Build BM25 vocabulary from all chunks
    const tokenizedChunks = allChunks.map(c => tokenize(c.content));
    const vocab = buildVocabulary(tokenizedChunks);

    // Embed in batches
    let totalUpserted = 0;

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      const batchTokens = tokenizedChunks.slice(i, i + batchSize);
      const texts = batch.map(c => c.content);

      const embedResult = await voyage.embedCode(texts);
      if (!embedResult.ok) {
        errors.push(embedResult.error);
        continue;
      }

      const points: QdrantPoint[] = batch.map((chunk, j) => {
        const sparse = computeBM25Sparse(batchTokens[j]!, vocab);
        return {
          id: createHash('sha256').update(`${options.projectId}:${chunk.filePath}:${chunk.startLine}`).digest('hex').slice(0, 32),
          vector: {
            dense: embedResult.value.embeddings[j]! as number[],
            sparse,
          },
          payload: {
            filePath: chunk.filePath,
            language: chunk.language,
            symbolName: chunk.symbolName ?? '',
            symbolType: chunk.symbolType ?? '',
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            scopeChain: chunk.scopeChain,
            contentHash: chunk.contentHash,
            content: chunk.content,
            projectId: options.projectId,
          },
        };
      });

      const upsertResult = await qdrant.upsertPoints(options.codeCollection, points);
      if (!upsertResult.ok) {
        errors.push(upsertResult.error);
        continue;
      }

      totalUpserted += points.length;
    }

    // Save updated Merkle tree
    await saveMerkleTree(currTree, options.merkleTreePath);

    return Ok({
      filesProcessed: filesToIndex.length,
      chunksCreated: allChunks.length,
      pointsUpserted: totalUpserted,
      errors,
      durationMs: Date.now() - start,
    });
  } catch (e: unknown) {
    return Err({
      code: 'INDEXING_PARTIAL_FAILURE',
      message: e instanceof Error ? e.message : String(e),
      recoverable: true,
    });
  }
}
