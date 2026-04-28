/**
 * @module @agentforge/retrieval/repo-map/repo-map
 *
 * Orchestrator: scan directory → parse → build graph → rank → render.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { RetrievalError } from '../types.js';
import { parseFile, detectLanguage } from './parser.js';
import type { ParsedFile } from './parser.js';
import { buildSymbolGraph } from './graph.js';
import { personalizedPageRank } from './pagerank.js';
import type { PageRankOptions } from './pagerank.js';
import { renderRepoMap } from './renderer.js';

export interface RepoMapOptions {
  readonly rootDir: string;
  readonly tokenBudget?: number;
  /** Glob patterns to exclude (simple prefix match on relative paths). */
  readonly exclude?: readonly string[];
  readonly seedFiles?: readonly string[];
}

const DEFAULT_EXCLUDE = ['node_modules', 'dist', '.git', '.next', '__pycache__', '.tsbuildinfo'];

async function scanDir(dir: string, rootDir: string, exclude: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (exclude.some(e => entry.name === e || entry.name.startsWith(e))) continue;

    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await scanDir(fullPath, rootDir, exclude);
      files.push(...subFiles);
    } else if (entry.isFile() && detectLanguage(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Generate a token-budgeted repo map for a directory. */
export async function generateRepoMap(options: RepoMapOptions): Promise<Result<string, RetrievalError>> {
  const exclude = [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])];

  try {
    const filePaths = await scanDir(options.rootDir, options.rootDir, exclude);
    const parsedFiles: ParsedFile[] = [];

    for (const fp of filePaths) {
      const content = await readFile(fp, 'utf-8');
      const lang = detectLanguage(fp);
      if (!lang) continue;

      const result = parseFile(fp, content, lang);
      if (result.ok) parsedFiles.push(result.value);
    }

    if (parsedFiles.length === 0) {
      return Ok('(no parseable files found)');
    }

    const graph = buildSymbolGraph(parsedFiles);
    const prOptions: PageRankOptions = { seedFiles: options.seedFiles };
    const ranked = personalizedPageRank(graph, prOptions);
    const map = renderRepoMap(ranked, { tokenBudget: options.tokenBudget });

    return Ok(map);
  } catch (e: unknown) {
    return Err({
      code: 'TREESITTER_PARSE_ERROR',
      message: e instanceof Error ? e.message : String(e),
      recoverable: false,
    });
  }
}
