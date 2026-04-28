/**
 * @module @agentforge/retrieval/chunking/code-chunker
 *
 * AST-aware code chunking. Splits at function/class boundaries using
 * the regex parser from the repo-map module. Each chunk includes
 * scope chain metadata and overlap from the preceding chunk.
 */

import { Ok, Err } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { createHash } from 'node:crypto';
import { parseFile, detectLanguage } from '../repo-map/parser.js';
import type { CodeChunk, RetrievalError } from '../types.js';

export interface ChunkOptions {
  readonly maxChunkTokens?: number;
  readonly minChunkTokens?: number;
  readonly overlapTokens?: number;
}

const APPROX_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / APPROX_CHARS_PER_TOKEN);
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Chunk a code file at symbol boundaries. */
export function chunkCodeFile(
  filePath: string,
  content: string,
  language?: string,
  options?: ChunkOptions,
): Result<readonly CodeChunk[], RetrievalError> {
  const lang = language ?? detectLanguage(filePath);
  if (!lang) {
    return Err({ code: 'TREESITTER_PARSE_ERROR', message: `Cannot detect language for ${filePath}`, recoverable: false });
  }

  const parseResult = parseFile(filePath, content, lang);
  if (!parseResult.ok) return parseResult;

  const maxTokens = options?.maxChunkTokens ?? 512;
  const minTokens = options?.minChunkTokens ?? 64;
  const overlapTokens = options?.overlapTokens ?? 32;
  const overlapChars = overlapTokens * APPROX_CHARS_PER_TOKEN;

  const lines = content.split('\n');
  const symbols = parseResult.value.symbols;
  const chunks: CodeChunk[] = [];

  if (symbols.length === 0) {
    // No symbols found — chunk the whole file as one
    if (content.trim().length > 0) {
      chunks.push({
        filePath,
        language: lang,
        content: content.trim(),
        startLine: 1,
        endLine: lines.length,
        scopeChain: [],
        contentHash: contentHash(content),
      });
    }
    return Ok(chunks);
  }

  let pendingContent = '';
  let pendingStartLine = 1;
  let lastEndLine = 0;

  for (const sym of symbols) {
    // Add any gap between symbols as prefix
    if (sym.startLine - 1 > lastEndLine) {
      const gapLines = lines.slice(lastEndLine, sym.startLine - 1);
      const gapText = gapLines.join('\n').trim();
      if (gapText.length > 0) {
        pendingContent += (pendingContent ? '\n' : '') + gapText;
      }
    }

    const symContent = lines.slice(sym.startLine - 1, sym.endLine).join('\n');
    const symTokens = estimateTokens(symContent);

    if (symTokens > maxTokens) {
      // Flush pending
      if (pendingContent.trim().length > 0) {
        chunks.push({
          filePath,
          language: lang,
          content: pendingContent.trim(),
          startLine: pendingStartLine,
          endLine: sym.startLine - 1,
          scopeChain: [],
          contentHash: contentHash(pendingContent),
        });
        pendingContent = '';
      }

      // Split large symbol into sub-chunks
      const subLines = symContent.split('\n');
      const chunkSize = Math.floor(maxTokens * APPROX_CHARS_PER_TOKEN);
      let subStart = 0;

      while (subStart < symContent.length) {
        const subEnd = Math.min(subStart + chunkSize, symContent.length);
        const subContent = symContent.slice(subStart, subEnd);
        const subStartLine = sym.startLine + subLines.findIndex((_, i) => {
          const offset = subLines.slice(0, i + 1).join('\n').length;
          return offset >= subStart;
        });

        chunks.push({
          filePath,
          language: lang,
          content: subContent,
          symbolName: sym.name,
          symbolType: sym.kind,
          startLine: Math.max(subStartLine, sym.startLine),
          endLine: sym.endLine,
          scopeChain: [sym.name],
          contentHash: contentHash(subContent),
        });

        subStart = subEnd - overlapChars;
        if (subStart >= subEnd) break;
      }

      pendingStartLine = sym.endLine + 1;
      lastEndLine = sym.endLine;
      continue;
    }

    const combinedTokens = estimateTokens(pendingContent + symContent);

    if (combinedTokens < minTokens) {
      // Merge with pending
      pendingContent += (pendingContent ? '\n' : '') + symContent;
    } else if (combinedTokens <= maxTokens) {
      // Still fits in one chunk
      pendingContent += (pendingContent ? '\n' : '') + symContent;
    } else {
      // Flush pending, start new
      if (pendingContent.trim().length > 0) {
        chunks.push({
          filePath,
          language: lang,
          content: pendingContent.trim(),
          startLine: pendingStartLine,
          endLine: sym.startLine - 1,
          scopeChain: [],
          contentHash: contentHash(pendingContent),
        });
      }
      pendingContent = symContent;
      pendingStartLine = sym.startLine;
    }

    lastEndLine = sym.endLine;
  }

  // Flush remaining
  if (pendingContent.trim().length > 0) {
    chunks.push({
      filePath,
      language: lang,
      content: pendingContent.trim(),
      startLine: pendingStartLine,
      endLine: lastEndLine || lines.length,
      scopeChain: [],
      contentHash: contentHash(pendingContent),
    });
  }

  return Ok(chunks);
}
