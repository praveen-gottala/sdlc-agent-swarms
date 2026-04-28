/**
 * @module @agentforge/retrieval/chunking/design-chunker
 *
 * Chunks DesignSpec JSON and component catalog YAML for embedding.
 * Splits design specs by node, catalogs by component entry.
 */

import { createHash } from 'node:crypto';
import { Ok } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import type { DesignChunk, RetrievalError } from '../types.js';

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

interface DesignSpecNode {
  readonly id?: string;
  readonly type?: string;
  readonly catalog?: string;
  readonly label?: string;
  readonly content?: string;
  readonly children?: readonly string[];
  readonly overrides?: Record<string, unknown>;
}

/** Chunk a DesignSpec JSON file by node. */
export function chunkDesignSpec(filePath: string, content: string, screenId: string): Result<readonly DesignChunk[], RetrievalError> {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Handle both designSpec.nodes and nodes at top level
    const nodes: Record<string, DesignSpecNode> =
      (parsed['designSpec'] as Record<string, unknown>)?.['nodes'] as Record<string, DesignSpecNode> ??
      (parsed['nodes'] as Record<string, DesignSpecNode>) ??
      (parsed['spec'] as Record<string, unknown>)?.['nodes'] as Record<string, DesignSpecNode> ??
      {};

    const chunks: DesignChunk[] = [];

    for (const [nodeId, node] of Object.entries(nodes)) {
      const nodeContent = JSON.stringify({ id: nodeId, ...node }, null, 2);
      chunks.push({
        filePath,
        content: nodeContent,
        screenId,
        nodeType: node.type,
        catalogEntry: node.catalog,
        contentHash: contentHash(nodeContent),
      });
    }

    if (chunks.length === 0) {
      // Fallback: chunk entire file
      chunks.push({
        filePath,
        content: content.slice(0, 4000),
        screenId,
        contentHash: contentHash(content),
      });
    }

    return Ok(chunks);
  } catch {
    return Ok([{
      filePath,
      content: content.slice(0, 4000),
      screenId,
      contentHash: contentHash(content),
    }]);
  }
}

/** Chunk a component catalog YAML by component entry. */
export function chunkCatalog(filePath: string, content: string): Result<readonly DesignChunk[], RetrievalError> {
  const chunks: DesignChunk[] = [];
  const lines = content.split('\n');
  let currentComponent: string | undefined;
  let currentLines: string[] = [];

  function flush(): void {
    const text = currentLines.join('\n').trim();
    if (text.length > 0 && currentComponent) {
      chunks.push({
        filePath,
        content: text,
        screenId: '__catalog__',
        catalogEntry: currentComponent,
        contentHash: contentHash(text),
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const topLevel = line.match(/^- id:\s*(.+)/);
    if (topLevel) {
      flush();
      currentComponent = topLevel[1]!.trim();
      currentLines.push(line);
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (chunks.length === 0) {
    chunks.push({
      filePath,
      content: content.slice(0, 4000),
      screenId: '__catalog__',
      contentHash: contentHash(content),
    });
  }

  return Ok(chunks);
}
