/**
 * @module @agentforge/agents-architect/graph/nodes/options-explorer
 *
 * Node 2 — Options Explorer.
 * For each unresolved gap in the ConstraintSet, calls Sonnet to explore
 * 2-4 alternative solutions. Produces an OptionsBundle with evidence
 * for Node 3 (Architecture Writer) to make final decisions.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePromptFrontmatter, debugLog, OptionMemoSchema } from '@agentforge/core';
import type { Gap, ConstraintSet, OptionsBundle, OptionMemo, EnrichedRequirement } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'prompts', 'options-explorer.md');
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version as string | undefined;
  return systemPromptCache;
}

function getPromptVersion(): string | undefined {
  if (!systemPromptCache) loadSystemPrompt();
  return promptVersionCache;
}

/** Test-only: reset cached prompt. */
export function _resetOptionsExplorerPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

export const OPTIONS_EXPLORER_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      gapId: { type: 'string' },
      axis: { type: 'string' },
      alternatives: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            tradeoffs: { type: 'array', items: { type: 'string' } },
            blastRadius: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            references: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'name', 'description', 'tradeoffs', 'blastRadius', 'references'],
        },
      },
      recommendation: { type: 'string' },
      rationale: { type: 'string' },
    },
    required: ['gapId', 'axis', 'alternatives', 'rationale'],
  },
};

/** Build per-gap user message for the Options Explorer LLM call. */
export function buildOptionsExplorerUserMessage(
  gap: Gap,
  constraintSet: ConstraintSet,
  enrichedRequirement: EnrichedRequirement | null,
): string {
  const parts: string[] = [];

  parts.push(`## Gap to explore\n`);
  parts.push(`- **ID:** ${gap.id}`);
  parts.push(`- **Axis:** ${gap.axis}`);
  parts.push(`- **Description:** ${gap.description}`);
  if (gap.defaultValue) {
    parts.push(`- **Default value:** ${gap.defaultValue}`);
  }

  parts.push(`\n## Constraints\n`);
  if (constraintSet.constraints.length > 0) {
    for (const c of constraintSet.constraints) {
      parts.push(`- [${c.type}] ${c.category}: ${c.description}`);
    }
  } else {
    parts.push('No constraints specified.');
  }

  if (enrichedRequirement) {
    const prd = enrichedRequirement.prd;
    parts.push(`\n## Project context\n`);
    parts.push(`- **Title:** ${prd.title}`);
    parts.push(`- **Description:** ${prd.description}`);
    parts.push(`- **Features:** ${prd.features.length}`);
    parts.push(`- **Data entities:** ${prd.dataEntities.length}`);
    parts.push(`- **Screens:** ${prd.screens.length}`);
    parts.push(`- **Mode:** ${constraintSet.mode}`);

    if (prd.dataEntities.length > 0) {
      parts.push(`\n### Data entities\n`);
      for (const e of prd.dataEntities) {
        parts.push(`- ${e.name} (${e.id})`);
      }
    }
  }

  return parts.join('\n');
}

/** Create the Options Explorer node (Node 2). */
export function createOptionsExplorer(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('optionsExplorer: ENTER');

    const constraintSet = state.constraintSet;
    if (!constraintSet) {
      debugLog('optionsExplorer: EXIT (no constraintSet)');
      return {};
    }

    const unresolvedGaps = constraintSet.gaps.filter((g) => !g.resolvedValue);
    if (unresolvedGaps.length === 0) {
      debugLog('optionsExplorer: EXIT (all gaps resolved)');
      const optionsBundle: OptionsBundle = { projectId: deps.projectId, memos: [] };
      return { optionsBundle };
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();

    const memos: OptionMemo[] = [];

    // Sequential calls — one per unresolved gap
    // TODO: parallelize with Promise.allSettled for >10 gap bundles
    for (const gap of unresolvedGaps) {
      debugLog(`optionsExplorer: exploring gap ${gap.id} (axis=${gap.axis})`);

      const userMessage = buildOptionsExplorerUserMessage(gap, constraintSet, state.enrichedRequirement);

      const result = await deps.provider.complete(
        { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
        {
          model: 'claude-sonnet-4-6',
          maxTokens: 65536,
          temperature: 0,
          responseSchema: OPTIONS_EXPLORER_RESPONSE_SCHEMA,
          promptVersion,
        },
      );

      if (!result.ok) {
        debugLog(`optionsExplorer: LLM failed for gap ${gap.id}: ${result.error.code}`);
        continue;
      }

      let raw: unknown;
      if (result.value.structured) {
        raw = result.value.structured;
      } else {
        try {
          const cleaned = result.value.content
            .replace(/^```(?:json)?\s*/m, '')
            .replace(/\s*```\s*$/m, '')
            .trim();
          raw = JSON.parse(cleaned);
        } catch {
          debugLog(`optionsExplorer: response for gap ${gap.id} is not valid JSON`);
          continue;
        }
      }

      const parsed = OptionMemoSchema.safeParse(raw);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        debugLog(`optionsExplorer: schema validation failed for gap ${gap.id}: ${issues}`);
        continue;
      }

      // Override gapId and axis from the gap object for safety (prevents LLM ID drift)
      memos.push({ ...parsed.data, gapId: gap.id, axis: gap.axis });
      debugLog(`optionsExplorer: gap ${gap.id} → ${parsed.data.alternatives.length} alternatives`);
    }

    if (memos.length === 0) {
      debugLog('optionsExplorer: EXIT (zero memos produced — all LLM calls failed)');
      return {};
    }

    const optionsBundle: OptionsBundle = { projectId: deps.projectId, memos };
    debugLog(`optionsExplorer: EXIT memos=${memos.length}`);
    return { optionsBundle };
  };
}
