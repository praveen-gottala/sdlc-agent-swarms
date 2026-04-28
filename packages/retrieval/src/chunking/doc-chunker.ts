/**
 * @module @agentforge/retrieval/chunking/doc-chunker
 *
 * Chunks markdown and YAML documents for embedding.
 * Markdown: splits at heading boundaries, preserves hierarchy.
 * YAML: splits at top-level keys.
 */

import { createHash } from 'node:crypto';
import { Ok } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { DocChunk, RetrievalError } from '../types.js';

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Chunk markdown by heading boundaries. */
export function chunkMarkdown(filePath: string, content: string): readonly DocChunk[] {
  const lines = content.split('\n');
  const chunks: DocChunk[] = [];
  let currentHeading: string | undefined;
  let currentLevel: number | undefined;
  let currentLines: string[] = [];

  function flush(): void {
    const text = currentLines.join('\n').trim();
    if (text.length > 0) {
      chunks.push({
        filePath,
        content: text,
        heading: currentHeading,
        headingLevel: currentLevel,
        docType: 'markdown',
        contentHash: contentHash(text),
      });
    }
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2]!.trim();
      currentLevel = headingMatch[1]!.length;
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  flush();
  return chunks;
}

/** Chunk YAML by top-level keys. */
export function chunkYaml(filePath: string, content: string): readonly DocChunk[] {
  const lines = content.split('\n');
  const chunks: DocChunk[] = [];
  let currentKey: string | undefined;
  let currentLines: string[] = [];

  function flush(): void {
    const text = currentLines.join('\n').trim();
    if (text.length > 0) {
      chunks.push({
        filePath,
        content: text,
        heading: currentKey,
        headingLevel: 1,
        docType: 'yaml',
        contentHash: contentHash(text),
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const topLevelKey = line.match(/^([a-zA-Z_][\w-]*)\s*:/);
    if (topLevelKey && !line.startsWith(' ') && !line.startsWith('\t')) {
      flush();
      currentKey = topLevelKey[1];
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  flush();
  return chunks;
}

/** Auto-detect format and chunk. */
export function chunkDocument(filePath: string, content: string): Result<readonly DocChunk[], RetrievalError> {
  if (filePath.endsWith('.md')) {
    return Ok(chunkMarkdown(filePath, content));
  }
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return Ok(chunkYaml(filePath, content));
  }
  // Plain text: single chunk
  const hash = contentHash(content);
  return Ok([{
    filePath,
    content: content.trim(),
    docType: 'text',
    contentHash: hash,
  }]);
}
