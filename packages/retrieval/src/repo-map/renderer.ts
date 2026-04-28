/**
 * @module @agentforge/retrieval/repo-map/renderer
 *
 * Renders a token-budgeted repo map from ranked symbols. Output format:
 *   filePath:line | kind symbolName(params): returnType
 *
 * Groups symbols by file for readability.
 */

import type { RankedSymbol } from './pagerank.js';

export interface RenderOptions {
  readonly tokenBudget?: number;
}

const APPROX_CHARS_PER_TOKEN = 4;

/** Render ranked symbols as a token-budgeted repo map string. */
export function renderRepoMap(ranked: readonly RankedSymbol[], options?: RenderOptions): string {
  const budget = options?.tokenBudget ?? 2048;
  const maxChars = budget * APPROX_CHARS_PER_TOKEN;

  // Group by file, preserving rank order for first-seen
  const fileOrder: string[] = [];
  const fileSymbols = new Map<string, RankedSymbol[]>();

  for (const sym of ranked) {
    const fp = sym.node.filePath;
    if (!fileSymbols.has(fp)) {
      fileOrder.push(fp);
      fileSymbols.set(fp, []);
    }
    fileSymbols.get(fp)!.push(sym);
  }

  const lines: string[] = [];
  let totalChars = 0;

  for (const fp of fileOrder) {
    const header = `\n${fp}`;
    if (totalChars + header.length > maxChars) break;
    lines.push(header);
    totalChars += header.length;

    const syms = fileSymbols.get(fp)!;
    for (const sym of syms) {
      const s = sym.node.symbol;
      const line = `  :${s.startLine} | ${s.kind} ${s.signature}`;
      if (totalChars + line.length + 1 > maxChars) break;
      lines.push(line);
      totalChars += line.length + 1;
    }
  }

  return lines.join('\n').trim();
}
