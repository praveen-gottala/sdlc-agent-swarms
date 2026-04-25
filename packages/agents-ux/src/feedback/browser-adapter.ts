/**
 * @module feedback/browser-adapter
 *
 * BrowserFeedbackAdapter — single LLM call producing DesignSpec patches.
 * Used by CLI (Task 2.5) and dashboard chat route (Task 3.5).
 */

import type { Result, LLMProviderRef } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { RendererTokens, CatalogMap } from '@agentforge/designspec-renderer';
import { openBrowserSession } from '@agentforge/designspec-renderer';
import type { FeedbackAdapter, DesignSpecPatch } from './types.js';
import { DesignSpecPatchSchema } from './types.js';
import { sanitizePatches } from '../ux-design/browser-correction-adapter.js';

const FEEDBACK_SYSTEM_PROMPT = `You are a design patch generator. Given a DesignSpec JSON and a user's change request,
return a JSON object with exactly two fields: "patches" and "reasoning".

RULES:
- "patches" is an object map: { "<nodeId>": { /* partial NodeSpec fields */ } }
- Each patch is shallow-merged into the existing NodeSpec for that node
- ONLY include fields you want to CHANGE — omit fields you don't want to touch
- Use exact node IDs from the spec — do NOT invent new ones
- Dimensions: positive numbers or "fill" for width
- Colors: use semantic token names (e.g., "cta-primary") not hex values
- Layout changes: include "dir" field when setting layout
- Include "reasoning" explaining your changes

NodeSpec fields you may use in patches:
  width: number | "fill", height: number, radius: number,
  background: string (token name), border: string (token name),
  shadow: "sm" | "md" | "lg", color: string (text color token),
  typography: string ("heading-1", "body", "label"),
  content: string, label: string, value: string | number,
  title: string, placeholder: string, helper: string,
  layout: { dir: "row"|"column", display?: "flex"|"grid", columns?: number,
    wrap?: boolean, gap?: number, align?: string, justify?: string,
    px?: number, py?: number, pt?: number, pb?: number }

Respond ONLY with the JSON object. No markdown fences, no extra text.`;

/** BrowserFeedbackAdapter: single LLM call → DesignSpec patches. */
export class BrowserFeedbackAdapter implements FeedbackAdapter {
  constructor(
    private readonly provider: LLMProviderRef,
    private readonly tokens?: RendererTokens,
    private readonly catalog?: CatalogMap,
  ) {}

  async reviewDesign(spec: DesignSpecV2, userMessage?: string): Promise<Result<DesignSpecPatch>> {
    if (!userMessage) {
      return Err({ code: 'INVALID_STATE', message: 'userMessage is required', recoverable: false });
    }

    const nodeIds = Object.keys(spec.nodes);
    const specJson = JSON.stringify(spec, null, 2);
    const content = `Current DesignSpec (${nodeIds.length} nodes):\n\n${specJson}\n\nUser request: ${userMessage}`;

    const result = await this.provider.complete(
      { system: FEEDBACK_SYSTEM_PROMPT, messages: [{ role: 'user', content }] },
      { model: 'claude-sonnet-4-6', maxTokens: 4096, temperature: 0 },
    );

    if (!result.ok) {
      return Err({ code: 'LLM_API_ERROR', message: `LLM error: ${(result.error as { code?: string }).code ?? 'unknown'}`, recoverable: true });
    }

    const completion = result.value as { content: string };
    const rawContent = completion.content.trim();
    let parsed: unknown;
    try {
      const cleaned = rawContent.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
      parsed = JSON.parse(cleaned);
    } catch {
      return Err({ code: 'LLM_MALFORMED_OUTPUT', message: 'Failed to parse LLM response as JSON', recoverable: true });
    }

    const zodResult = DesignSpecPatchSchema.safeParse(parsed);
    if (!zodResult.success) {
      return Err({ code: 'LLM_MALFORMED_OUTPUT', message: `Response failed schema validation: ${zodResult.error.message}`, recoverable: true });
    }

    const sanitized = sanitizePatches(zodResult.data.patches as Record<string, Record<string, unknown>>);

    return Ok({ patches: sanitized, reasoning: zodResult.data.reasoning });
  }

  applyPatch(spec: DesignSpecV2, patch: DesignSpecPatch): DesignSpecV2 {
    const cloned: DesignSpecV2 = JSON.parse(JSON.stringify(spec));
    const nodes = cloned.nodes as unknown as Record<string, Record<string, unknown>>;

    for (const [nodeId, fields] of Object.entries(patch.patches)) {
      if (!nodes[nodeId]) continue;

      for (const [key, value] of Object.entries(fields)) {
        if (key === 'layout' && typeof value === 'object' && value !== null) {
          nodes[nodeId]['layout'] = { ...(nodes[nodeId]['layout'] as Record<string, unknown> ?? {}), ...value };
        } else {
          nodes[nodeId][key] = value;
        }
      }
    }

    return cloned;
  }

  async showPreview(spec: DesignSpecV2): Promise<void> {
    if (!this.tokens || !this.catalog) return;

    try {
      const { session } = await openBrowserSession(spec, this.tokens, this.catalog);
      await new Promise(resolve => setTimeout(resolve, 2000));
      await session.close();
    } catch {
      // Preview is best-effort — don't fail the feedback loop
    }
  }
}
