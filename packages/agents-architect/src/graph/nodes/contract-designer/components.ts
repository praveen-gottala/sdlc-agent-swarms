/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer/components
 *
 * Node 4.3 — Component Specialist.
 * Produces ComponentCompositions with prop-level signatures.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  ComponentTreeNodeSchema,
} from '@agentforge/core';
import type { ComponentComposition } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'prompts', 'contract-designer', 'components.md',
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

export function _resetComponentsPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const ComponentCompositionItemSchema = z.object({
  screenId: z.string(),
  componentTree: z.array(ComponentTreeNodeSchema),
});

const ComponentsLlmOutputSchema = z.object({
  compositions: z.array(ComponentCompositionItemSchema),
});

export const COMPONENTS_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      compositions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            screenId: { type: 'string' },
            componentTree: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  type: { type: 'string' },
                  catalogId: { type: 'string' },
                  children: { type: 'array', items: { type: 'string' } },
                  props: { type: 'object' },
                },
                required: ['id', 'type'],
              },
            },
          },
          required: ['screenId', 'componentTree'],
        },
      },
    },
    required: ['compositions'],
  },
};

/** Build components specialist user message (exported for wiring tests). */
export function buildComponentsUserMessage(state: ArchitectStateType): string {
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
  }

  if (state.architectureSpec) {
    parts.push('\n## Architecture decisions\n');
    parts.push(JSON.stringify(state.architectureSpec.decisions, null, 2));
    parts.push('\n## Stack config\n');
    parts.push(JSON.stringify(state.architectureSpec.stackConfig, null, 2));
    if (state.architectureSpec.implementationPatterns?.length) {
      parts.push('\n## Implementation patterns\n');
      parts.push(
        state.architectureSpec.implementationPatterns
          .map((p) => `- ${p.id}: ${p.rule}`)
          .join('\n'),
      );
    }
  }

  if (state.dataModelSpec) {
    parts.push('\n## Data model (from Node 4.1)\n');
    parts.push(JSON.stringify(state.dataModelSpec, null, 2));
  }

  if (state.apiChangeSets.length > 0) {
    parts.push('\n## API change sets (from Node 4.2)\n');
    parts.push(JSON.stringify(state.apiChangeSets, null, 2));
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

/** Create Node 4.3 — Component Specialist. */
export function createComponentsSpecialist(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner/components: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner/components: EXIT (no architectureSpec)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildComponentsUserMessage(state);

    debugLog('contractDesigner/components: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
        temperature: 0,
        responseSchema: COMPONENTS_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`contractDesigner/components: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`contractDesigner/components: LLM failed ${result.error.code}`);
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
        debugLog('contractDesigner/components: response is not valid JSON');
        return {};
      }
    }

    const parsed = ComponentsLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`contractDesigner/components: schema validation failed: ${issues}`);
      return {};
    }

    const compositions: readonly ComponentComposition[] = parsed.data.compositions;
    debugLog(`contractDesigner/components: EXIT compositions=${compositions.length}`);
    return { componentCompositions: compositions };
  };
}

export { ComponentsLlmOutputSchema };
