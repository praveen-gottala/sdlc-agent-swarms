/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer/data-model
 *
 * Node 4.1 — Data Model Specialist.
 * Produces column-level DataModelSpec from architecture decisions + enriched requirement.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  DataModelEntitySchema,
} from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'prompts', 'contract-designer', 'data-model.md',
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

export function _resetDataModelPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const DataModelLlmOutputSchema = z.object({
  projectId: z.string(),
  entities: z.array(DataModelEntitySchema),
});

export const DATA_MODEL_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      projectId: { type: 'string' },
      entities: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  required: { type: 'boolean' },
                  description: { type: 'string' },
                },
                required: ['name', 'type', 'required'],
              },
            },
            tableName: { type: 'string' },
            relationships: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'name', 'fields'],
        },
      },
    },
    required: ['projectId', 'entities'],
  },
};

/** Build data-model specialist user message (exported for wiring tests). */
export function buildDataModelUserMessage(state: ArchitectStateType): string {
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
        const fields = e.fields.map((f) => `${f.name}:${f.type}`).join(', ');
        parts.push(`- ${e.id}: ${e.name} [${fields}]`);
      }
    }
  }

  if (state.architectureSpec) {
    parts.push('\n## Architecture decisions\n');
    parts.push(JSON.stringify(state.architectureSpec.decisions, null, 2));
    parts.push('\n## Stack config\n');
    parts.push(JSON.stringify(state.architectureSpec.stackConfig, null, 2));
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

/** Create Node 4.1 — Data Model Specialist. */
export function createDataModelSpecialist(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner/dataModel: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner/dataModel: EXIT (no architectureSpec)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildDataModelUserMessage(state);

    debugLog('contractDesigner/dataModel: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 65536,
        temperature: 0,
        responseSchema: DATA_MODEL_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`contractDesigner/dataModel: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`contractDesigner/dataModel: LLM failed ${result.error.code}`);
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
        debugLog('contractDesigner/dataModel: response is not valid JSON');
        return {};
      }
    }

    const parsed = DataModelLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`contractDesigner/dataModel: schema validation failed: ${issues}`);
      return {};
    }

    debugLog(`contractDesigner/dataModel: EXIT entities=${parsed.data.entities.length}`);
    return { dataModelSpec: parsed.data };
  };
}

export { DataModelLlmOutputSchema };
