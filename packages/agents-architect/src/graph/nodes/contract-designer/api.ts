/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer/api
 *
 * Node 4.2 — API Specialist.
 * Produces ApiChangeSets describing endpoint contracts, OpenAPI 3.1 conformant.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  EndpointChangeSchema,
} from '@agentforge/core';
import type { APIChangeSet } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'prompts', 'contract-designer', 'api.md',
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

export function _resetApiPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const ApiChangeSetItemSchema = z.object({
  id: z.string(),
  changeRequestId: z.string(),
  additions: z.array(EndpointChangeSchema),
  modifications: z.array(EndpointChangeSchema),
  removals: z.array(EndpointChangeSchema),
});

const ApiLlmOutputSchema = z.object({
  apiChangeSets: z.array(ApiChangeSetItemSchema),
});

export const API_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      apiChangeSets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            changeRequestId: { type: 'string' },
            additions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  description: { type: 'string' },
                  breaking: { type: 'boolean' },
                },
                required: ['method', 'path', 'description', 'breaking'],
              },
            },
            modifications: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  description: { type: 'string' },
                  breaking: { type: 'boolean' },
                },
                required: ['method', 'path', 'description', 'breaking'],
              },
            },
            removals: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  method: { type: 'string' },
                  path: { type: 'string' },
                  description: { type: 'string' },
                  breaking: { type: 'boolean' },
                },
                required: ['method', 'path', 'description', 'breaking'],
              },
            },
          },
          required: ['id', 'changeRequestId', 'additions', 'modifications', 'removals'],
        },
      },
    },
    required: ['apiChangeSets'],
  },
};

/** Build API specialist user message (exported for wiring tests). */
export function buildApiUserMessage(state: ArchitectStateType): string {
  const parts: string[] = [];

  parts.push(`## Project mode\n${state.mode}`);

  if (state.enrichedRequirement) {
    const prd = state.enrichedRequirement.prd;
    parts.push('\n## PRD Features\n');
    for (const f of prd.features) {
      parts.push(`- ${f.id}: ${f.name} (${f.priority ?? 'must-have'}) — ${f.description}`);
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
    parts.push('\n## Stack config\n');
    parts.push(JSON.stringify(state.architectureSpec.stackConfig, null, 2));
  }

  if (state.dataModelSpec) {
    parts.push('\n## Data model (from Node 4.1)\n');
    parts.push(JSON.stringify(state.dataModelSpec, null, 2));
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

/** Create Node 4.2 — API Specialist. */
export function createApiSpecialist(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner/api: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner/api: EXIT (no architectureSpec)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildApiUserMessage(state);

    debugLog('contractDesigner/api: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 4096,
        temperature: 0,
        responseSchema: API_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`contractDesigner/api: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`contractDesigner/api: LLM failed ${result.error.code}`);
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
        debugLog('contractDesigner/api: response is not valid JSON');
        return {};
      }
    }

    const parsed = ApiLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`contractDesigner/api: schema validation failed: ${issues}`);
      return {};
    }

    const changeSets: readonly APIChangeSet[] = parsed.data.apiChangeSets;
    debugLog(`contractDesigner/api: EXIT changeSets=${changeSets.length}`);
    return { apiChangeSets: changeSets };
  };
}

export { ApiLlmOutputSchema };
