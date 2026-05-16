/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer/screens
 *
 * Node 4.4 — Screen Specialist.
 * Produces ScreenPlans with data bindings referencing entity ids.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  DataBindingSchema,
} from '@agentforge/core';
import type { ScreenPlan } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'prompts', 'contract-designer', 'screens.md',
  );
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

export function _resetScreensPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const ScreenPlanItemSchema = z.object({
  id: z.string(),
  featureId: z.string(),
  screenType: z.enum(['page', 'modal', 'drawer', 'sheet']),
  route: z.string(),
  components: z.array(z.string()),
  dataBindings: z.array(DataBindingSchema),
  navigationTargets: z.array(z.object({
    target: z.string(),
    trigger: z.string(),
  })),
});

const ScreensLlmOutputSchema = z.object({
  screenPlans: z.array(ScreenPlanItemSchema),
});

export const SCREENS_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      screenPlans: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            featureId: { type: 'string' },
            screenType: { type: 'string', enum: ['page', 'modal', 'drawer', 'sheet'] },
            route: { type: 'string' },
            components: { type: 'array', items: { type: 'string' } },
            dataBindings: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  entityId: { type: 'string' },
                  field: { type: 'string' },
                  source: { type: 'string' },
                  transform: { type: 'string' },
                },
                required: ['entityId', 'field', 'source'],
              },
            },
            navigationTargets: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  target: { type: 'string' },
                  trigger: { type: 'string' },
                },
                required: ['target', 'trigger'],
              },
            },
          },
          required: ['id', 'featureId', 'screenType', 'route', 'components', 'dataBindings', 'navigationTargets'],
        },
      },
    },
    required: ['screenPlans'],
  },
};

/** Build screens specialist user message (exported for wiring tests). */
export function buildScreensUserMessage(state: ArchitectStateType): string {
  const parts: string[] = [];

  parts.push(`## Project mode\n${state.mode}`);

  if (state.enrichedRequirement) {
    const prd = state.enrichedRequirement.prd;
    parts.push('\n## PRD Features\n');
    for (const f of prd.features) {
      parts.push(`- ${f.id}: ${f.name} (${f.priority ?? 'must-have'}) — ${f.description}`);
    }
    if (prd.screens.length > 0) {
      parts.push('\n## PRD Screens\n');
      for (const s of prd.screens) {
        parts.push(`- ${s.id}: ${s.name} (${s.screenType ?? 'page'}) — ${s.description}`);
      }
    }
    if (prd.dataEntities.length > 0) {
      parts.push('\n## PRD Data Entities\n');
      for (const e of prd.dataEntities) {
        parts.push(`- ${e.id}: ${e.name}`);
      }
    }
  }

  if (state.architectureSpec) {
    parts.push('\n## Architecture decisions\n');
    parts.push(JSON.stringify(state.architectureSpec.decisions, null, 2));
  }

  if (state.dataModelSpec) {
    parts.push('\n## Data model (from Node 4.1)\n');
    parts.push(JSON.stringify(state.dataModelSpec, null, 2));
  }

  if (state.apiChangeSets.length > 0) {
    parts.push('\n## API change sets (from Node 4.2)\n');
    parts.push(JSON.stringify(state.apiChangeSets, null, 2));
  }

  if (state.componentCompositions.length > 0) {
    parts.push('\n## Component compositions (from Node 4.3)\n');
    parts.push(JSON.stringify(state.componentCompositions, null, 2));
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

/** Create Node 4.4 — Screen Specialist. */
export function createScreensSpecialist(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner/screens: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner/screens: EXIT (no architectureSpec)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildScreensUserMessage(state);

    debugLog('contractDesigner/screens: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 65536,
        temperature: 0,
        responseSchema: SCREENS_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`contractDesigner/screens: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`contractDesigner/screens: LLM failed ${result.error.code}`);
      return {};
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
        debugLog('contractDesigner/screens: response is not valid JSON');
        return {};
      }
    }

    const parsed = ScreensLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`contractDesigner/screens: schema validation failed: ${issues}`);
      return {};
    }

    const plans: readonly ScreenPlan[] = parsed.data.screenPlans;
    debugLog(`contractDesigner/screens: EXIT plans=${plans.length}`);
    return { screenPlans: plans };
  };
}

export { ScreensLlmOutputSchema };
