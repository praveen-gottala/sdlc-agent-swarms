/**
 * @module @agentforge/retrieval/repo-map/pagerank
 *
 * Personalized PageRank over the symbol graph. Higher scores indicate
 * more structurally important symbols (referenced by many others).
 */

import type { SymbolGraph, SymbolNode } from './graph.js';

export interface RankedSymbol {
  readonly key: string;
  readonly node: SymbolNode;
  readonly score: number;
}

export interface PageRankOptions {
  readonly damping?: number;
  readonly convergence?: number;
  readonly maxIterations?: number;
  /** Seed files for personalization — 50% budget goes to symbols in these files. */
  readonly seedFiles?: readonly string[];
}

/** Run personalized PageRank on the symbol graph. */
export function personalizedPageRank(graph: SymbolGraph, options?: PageRankOptions): readonly RankedSymbol[] {
  const damping = options?.damping ?? 0.85;
  const convergence = options?.convergence ?? 1e-6;
  const maxIterations = options?.maxIterations ?? 100;
  const seedFiles = new Set(options?.seedFiles ?? []);

  const keys = [...graph.nodes.keys()];
  const n = keys.length;
  if (n === 0) return [];

  const keyIndex = new Map<string, number>();
  for (let i = 0; i < n; i++) keyIndex.set(keys[i]!, i);

  // Build adjacency list (outgoing edges)
  const outEdges = new Array<number[]>(n);
  for (let i = 0; i < n; i++) outEdges[i] = [];

  for (const edge of graph.edges) {
    const fromIdx = keyIndex.get(edge.from);
    const toIdx = keyIndex.get(edge.to);
    if (fromIdx !== undefined && toIdx !== undefined) {
      outEdges[fromIdx]!.push(toIdx);
    }
  }

  // Personalization vector
  const personalization = new Float64Array(n);
  if (seedFiles.size > 0) {
    let seedCount = 0;
    for (let i = 0; i < n; i++) {
      const node = graph.nodes.get(keys[i]!)!;
      if (seedFiles.has(node.filePath)) {
        personalization[i] = 1;
        seedCount++;
      }
    }
    if (seedCount > 0) {
      const seedWeight = 0.5 / seedCount;
      const otherWeight = 0.5 / (n - seedCount || 1);
      for (let i = 0; i < n; i++) {
        personalization[i] = personalization[i]! > 0 ? seedWeight : otherWeight;
      }
    } else {
      personalization.fill(1 / n);
    }
  } else {
    personalization.fill(1 / n);
  }

  // Iterative PageRank
  let scores = new Float64Array(n).fill(1 / n);
  let newScores = new Float64Array(n);

  for (let iter = 0; iter < maxIterations; iter++) {
    newScores.fill(0);

    // Distribute rank along edges
    for (let i = 0; i < n; i++) {
      const out = outEdges[i]!;
      if (out.length === 0) {
        // Dangling node: distribute evenly
        const share = scores[i]! / n;
        for (let j = 0; j < n; j++) newScores[j] += share;
      } else {
        const share = scores[i]! / out.length;
        for (const j of out) newScores[j] += share;
      }
    }

    // Apply damping + personalization
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      newScores[i] = (1 - damping) * personalization[i]! + damping * newScores[i]!;
      maxDelta = Math.max(maxDelta, Math.abs(newScores[i]! - scores[i]!));
    }

    [scores, newScores] = [newScores, scores];

    if (maxDelta < convergence) break;
  }

  // Build ranked results
  const ranked: RankedSymbol[] = [];
  for (let i = 0; i < n; i++) {
    ranked.push({
      key: keys[i]!,
      node: graph.nodes.get(keys[i]!)!,
      score: scores[i]!,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
