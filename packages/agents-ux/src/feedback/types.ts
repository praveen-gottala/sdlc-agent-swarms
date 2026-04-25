/**
 * @module feedback/types
 *
 * FeedbackAdapter interface and DesignSpecPatch schema for the unified
 * design pipeline's feedback loop. Matches execution-plan.md Task 2.5
 * (lines 417-421) exactly.
 */

import { z } from 'zod';
import type { Result } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';

/**
 * Zod schema for LLM-produced design patches.
 * Per CLAUDE.md §Typed Contracts: "Every LLM call with structured output
 * uses zod-to-json-schema to produce the response schema."
 */
export const DesignSpecPatchSchema = z.object({
  patches: z.record(z.record(z.unknown())),
  reasoning: z.string(),
});

export type DesignSpecPatch = z.infer<typeof DesignSpecPatchSchema>;

/**
 * Feedback adapter for iterating on existing designs.
 *
 * Two implementations:
 * - BrowserFeedbackAdapter: single LLM call → DesignSpec JSON patches
 * - PenpotFeedbackAdapter: wraps DesignCollaborationSession → Penpot JS code
 */
export interface FeedbackAdapter {
  /** Send spec + user message to LLM, get back structured patches. */
  reviewDesign(spec: DesignSpecV2, userMessage?: string): Promise<Result<DesignSpecPatch>>;
  /** Apply patches to spec immutably. Returns new spec. */
  applyPatch(spec: DesignSpecV2, patch: DesignSpecPatch): DesignSpecV2;
  /** Render the spec in a preview (browser session or Penpot live). */
  showPreview(spec: DesignSpecV2): Promise<void>;
}
