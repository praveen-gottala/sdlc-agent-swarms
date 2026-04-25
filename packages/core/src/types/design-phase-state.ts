/**
 * @module @agentforge/core/types/design-phase-state
 *
 * Zod schemas for the unified design pipeline state.
 * These live in core so both CLI and dashboard can import them
 * without depending on @agentforge/agents-ux.
 *
 * Agent-specific output schemas (UXResearchOutputSchema, etc.)
 * remain in @agentforge/agents-ux — core cannot import from agents-ux.
 */

import { z } from 'zod';

/** Supported design tool backends. Browser is the default per sdlc-agents.md §11.1.1. */
export const DesignToolSchema = z.enum(['browser', 'penpot']);
export type DesignTool = z.infer<typeof DesignToolSchema>;

/** Canonical design output: DesignSpec v2 plus optional tool-specific metadata. */
export const DesignOutputSchema = z.object({
  spec: z.record(z.unknown()),
  designToolMetadata: z.object({
    tool: DesignToolSchema,
    nodeIds: z.record(z.string()).optional(),
    projectId: z.string().optional(),
    screenshotPaths: z.array(z.string()).optional(),
    // Penpot-only: LLM-generated script for replay; populated when tool === 'penpot'
    script: z.string().optional(),
  }).optional(),
});
export type DesignOutput = z.infer<typeof DesignOutputSchema>;
