/**
 * @module @agentforge/retrieval/eval/eval-runner
 *
 * Evaluates retrieval quality against a golden query set.
 * Computes precision@K: what fraction of queries have at least one
 * expected file in the top-K results.
 */

import type { GoldenQuery } from './golden-queries.js';

export interface EvalHit {
  readonly filePath: string;
  readonly score: number;
}

export interface QueryResult {
  readonly query: GoldenQuery;
  readonly hits: readonly EvalHit[];
  readonly hit: boolean;
  readonly matchedFile?: string;
}

export interface EvalResult {
  readonly precisionAtK: number;
  readonly k: number;
  readonly totalQueries: number;
  readonly hits: number;
  readonly misses: number;
  readonly results: readonly QueryResult[];
}

/** Check if any hit file matches an expected file (prefix match). */
function hasMatch(hitFiles: readonly string[], expectedFiles: readonly string[]): string | undefined {
  for (const hit of hitFiles) {
    for (const expected of expectedFiles) {
      if (expected.endsWith('/')) {
        if (hit.includes(expected.replace(/\/$/, ''))) return hit;
      } else {
        if (hit.endsWith(expected) || hit.includes(expected)) return hit;
      }
    }
  }
  return undefined;
}

/** Compute precision@K for a set of golden queries and their results. */
export function computePrecisionAtK(
  queries: readonly GoldenQuery[],
  results: ReadonlyMap<string, readonly EvalHit[]>,
  k: number = 5,
): EvalResult {
  const queryResults: QueryResult[] = [];
  let hits = 0;

  for (const query of queries) {
    const topK = (results.get(query.query) ?? []).slice(0, k);
    const hitFiles = topK.map(h => h.filePath);
    const matchedFile = hasMatch(hitFiles, query.expectedFiles);
    const isHit = matchedFile !== undefined;

    if (isHit) hits++;

    queryResults.push({
      query,
      hits: topK,
      hit: isHit,
      matchedFile,
    });
  }

  return {
    precisionAtK: queries.length > 0 ? hits / queries.length : 0,
    k,
    totalQueries: queries.length,
    hits,
    misses: queries.length - hits,
    results: queryResults,
  };
}
