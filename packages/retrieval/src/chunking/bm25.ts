/**
 * @module @agentforge/retrieval/chunking/bm25
 *
 * BM25 sparse vector generation for hybrid search. Tokenizes text
 * preserving camelCase components and builds TF-IDF sparse vectors.
 */

import type { SparseVector } from '../types.js';

export interface BM25Vocabulary {
  readonly termToIndex: ReadonlyMap<string, number>;
  readonly idf: ReadonlyMap<string, number>;
  readonly avgDocLength: number;
  readonly docCount: number;
}

const CAMEL_SPLIT = /(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_\-./\\:;\s,(){}[\]<>"'`|&=+*!?@#$%^~]+/;

/** Tokenize text preserving camelCase components. */
export function tokenize(text: string): readonly string[] {
  return text
    .split(CAMEL_SPLIT)
    .map(t => t.toLowerCase().trim())
    .filter(t => t.length >= 2 && t.length <= 50);
}

/** Build vocabulary and IDF scores from a corpus. */
export function buildVocabulary(corpus: readonly (readonly string[])[]): BM25Vocabulary {
  const df = new Map<string, number>();
  let totalLength = 0;

  for (const doc of corpus) {
    totalLength += doc.length;
    const seen = new Set<string>();
    for (const term of doc) {
      if (!seen.has(term)) {
        df.set(term, (df.get(term) ?? 0) + 1);
        seen.add(term);
      }
    }
  }

  const n = corpus.length;
  const termToIndex = new Map<string, number>();
  const idf = new Map<string, number>();
  let idx = 0;

  for (const [term, docFreq] of df) {
    termToIndex.set(term, idx++);
    idf.set(term, Math.log((n - docFreq + 0.5) / (docFreq + 0.5) + 1));
  }

  return {
    termToIndex,
    idf,
    avgDocLength: n > 0 ? totalLength / n : 0,
    docCount: n,
  };
}

export interface BM25Config {
  readonly k1?: number;
  readonly b?: number;
}

/** Compute BM25 sparse vector for a document's tokens. */
export function computeBM25Sparse(
  tokens: readonly string[],
  vocab: BM25Vocabulary,
  config?: BM25Config,
): SparseVector {
  const k1 = config?.k1 ?? 1.2;
  const b = config?.b ?? 0.75;
  const docLen = tokens.length;

  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  const indices: number[] = [];
  const values: number[] = [];

  for (const [term, freq] of tf) {
    const termIdx = vocab.termToIndex.get(term);
    const termIdf = vocab.idf.get(term);
    if (termIdx === undefined || termIdf === undefined) continue;

    const numerator = freq * (k1 + 1);
    const denominator = freq + k1 * (1 - b + b * (docLen / vocab.avgDocLength));
    const score = termIdf * (numerator / denominator);

    if (score > 0) {
      indices.push(termIdx);
      values.push(score);
    }
  }

  return { indices, values };
}
