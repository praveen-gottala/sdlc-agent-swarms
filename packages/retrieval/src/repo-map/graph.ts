/**
 * @module @agentforge/retrieval/repo-map/graph
 *
 * Builds a directed symbol graph from parsed files. Edges go from
 * referencing file to referenced symbol (via import resolution).
 */

import type { ParsedFile, ParsedSymbol } from './parser.js';

export interface SymbolNode {
  readonly filePath: string;
  readonly symbol: ParsedSymbol;
  readonly inDegree: number;
  readonly outDegree: number;
}

export interface SymbolEdge {
  readonly from: string;
  readonly to: string;
}

export interface SymbolGraph {
  readonly nodes: ReadonlyMap<string, SymbolNode>;
  readonly edges: readonly SymbolEdge[];
}

function makeNodeKey(filePath: string, name: string): string {
  return `${filePath}::${name}`;
}

function resolveImportSource(importSource: string, importingFile: string): string | undefined {
  if (importSource.startsWith('.')) {
    const dir = importingFile.substring(0, importingFile.lastIndexOf('/'));
    const parts = importSource.replace(/\.js$/, '').split('/');
    const resolved: string[] = dir.split('/');

    for (const part of parts) {
      if (part === '.') continue;
      if (part === '..') { resolved.pop(); continue; }
      resolved.push(part);
    }

    const base = resolved.join('/');
    return base.endsWith('.ts') || base.endsWith('.tsx') ? base : base;
  }
  return undefined;
}

/** Build a symbol graph from parsed files. */
export function buildSymbolGraph(files: readonly ParsedFile[]): SymbolGraph {
  const symbolsByFile = new Map<string, Map<string, ParsedSymbol>>();
  const nodesMap = new Map<string, SymbolNode>();
  const inDegrees = new Map<string, number>();
  const outDegrees = new Map<string, number>();
  const edges: SymbolEdge[] = [];

  // Index all symbols by file
  for (const file of files) {
    const fileSymbols = new Map<string, ParsedSymbol>();
    for (const sym of file.symbols) {
      if (sym.exported) {
        fileSymbols.set(sym.name, sym);
      }
      const key = makeNodeKey(file.filePath, sym.name);
      inDegrees.set(key, 0);
      outDegrees.set(key, 0);
    }
    symbolsByFile.set(file.filePath, fileSymbols);
  }

  // Resolve imports to build edges
  for (const file of files) {
    for (const imp of file.imports) {
      const resolvedBase = resolveImportSource(imp.source, file.filePath);
      if (!resolvedBase) continue;

      // Try common file extensions
      const candidates = [resolvedBase, `${resolvedBase}.ts`, `${resolvedBase}.tsx`, `${resolvedBase}/index.ts`];
      let targetSymbols: Map<string, ParsedSymbol> | undefined;
      for (const candidate of candidates) {
        targetSymbols = symbolsByFile.get(candidate);
        if (targetSymbols) break;
      }
      if (!targetSymbols) continue;

      for (const specifier of imp.specifiers) {
        const name = specifier.startsWith('* as ') ? specifier.slice(5) : specifier;
        const targetSym = targetSymbols.get(name);
        if (!targetSym) continue;

        // Edge from each symbol in this file to the imported symbol
        const toKey = makeNodeKey(
          [...candidates].find(c => symbolsByFile.has(c)) ?? resolvedBase,
          name,
        );

        for (const localSym of file.symbols) {
          const fromKey = makeNodeKey(file.filePath, localSym.name);
          edges.push({ from: fromKey, to: toKey });
          outDegrees.set(fromKey, (outDegrees.get(fromKey) ?? 0) + 1);
          inDegrees.set(toKey, (inDegrees.get(toKey) ?? 0) + 1);
        }
      }
    }
  }

  // Build final nodes
  for (const file of files) {
    for (const sym of file.symbols) {
      const key = makeNodeKey(file.filePath, sym.name);
      nodesMap.set(key, {
        filePath: file.filePath,
        symbol: sym,
        inDegree: inDegrees.get(key) ?? 0,
        outDegree: outDegrees.get(key) ?? 0,
      });
    }
  }

  return { nodes: nodesMap, edges };
}
