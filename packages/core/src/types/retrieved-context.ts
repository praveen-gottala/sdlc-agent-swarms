/**
 * @module @agentforge/core/types/retrieved-context
 *
 * Zod schema for RetrievedContext — the output of the RAG retrieval layer.
 * Used by spine stages (Clarifier, Architect) to ground decisions in
 * actual codebase content.
 */

import { z } from 'zod';

const CodeChunkSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  symbolName: z.string().optional(),
  symbolType: z.enum(['function', 'class', 'method', 'interface', 'type', 'variable', 'enum']).optional(),
  startLine: z.number(),
  endLine: z.number(),
  relevanceScore: z.number(),
});

const DocChunkSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  heading: z.string().optional(),
  docType: z.enum(['markdown', 'yaml', 'text']),
  relevanceScore: z.number(),
});

const DesignChunkSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  screenId: z.string(),
  catalogEntry: z.string().optional(),
  relevanceScore: z.number(),
});

/** Zod schema for RetrievedContext. */
export const RetrievedContextSchema = z.object({
  repoMap: z.string().optional(),
  codeChunks: z.array(CodeChunkSchema),
  docChunks: z.array(DocChunkSchema),
  designChunks: z.array(DesignChunkSchema),
  retrievedAt: z.string(),
  queryUsed: z.string(),
  totalTokens: z.number(),
});

/** TypeScript type derived from the Zod schema. */
export type RetrievedContext = z.infer<typeof RetrievedContextSchema>;
