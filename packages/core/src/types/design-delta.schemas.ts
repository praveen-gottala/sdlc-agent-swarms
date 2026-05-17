/**
 * @module @agentforge/core/types/design-delta.schemas
 *
 * Zod schemas for DesignSpecDelta — R9 §6.2 refined hybrid delta format.
 * Mirrors the TypeScript interfaces in
 * `packages/designspec-renderer/src/renderer/delta/delta-types.ts`.
 *
 * Apply semantics live in `@agentforge/designspec-renderer` (`deltaApply`) —
 * this module provides validation only.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// ReorderEntry — reorder instruction for an existing node
// ---------------------------------------------------------------------------

export const ReorderEntrySchema = z.object({
  nodeId: z.string(),
  newParent: z.string().optional(),
  newOrder: z.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// NodeSpec partial — flat record for added/modified nodes.
// Uses z.record since NodeSpec has many optional fields; post-hoc validation
// against the full DesignSpecV2 schema happens at deltaApply time.
// ---------------------------------------------------------------------------

const NodeSpecPartialSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// DesignSpecDelta — delta between two DesignSpecV2 documents
// ---------------------------------------------------------------------------

export const DesignSpecDeltaSchema = z.object({
  screenId: z.string(),
  baseWidth: z.number().int().min(0),
  added: z.record(z.string(), NodeSpecPartialSchema),
  modified: z.record(z.string(), NodeSpecPartialSchema),
  removed: z.array(z.string()),
  reordered: z.array(ReorderEntrySchema),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type ReorderEntry = z.infer<typeof ReorderEntrySchema>;
export type DesignSpecDelta = z.infer<typeof DesignSpecDeltaSchema>;
