/**
 * @module @agentforge/agents-clarifier/nodes/prd-analyzer
 *
 * PRD/Request Analyzer node (Task 1.2).
 * Extracts structured intent from raw input using forced-JSON via Zod schema.
 * Model: claude-opus-4-6. All LLM calls via TracedProvider (ADR-046).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRDSchema, parsePromptFrontmatter, debugLog } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState } from '../types.js';

// ---------------------------------------------------------------------------
// Prompt loading (cached, lazy — import.meta.url inside function per lesson)
// ---------------------------------------------------------------------------

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'prompts',
    'prd-analyzer-system.md',
  );
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version;
  return systemPromptCache;
}

function getPromptVersion(): string | undefined {
  if (!systemPromptCache) loadSystemPrompt();
  return promptVersionCache;
}

/** Reset cached prompt — test-only. */
export function _resetPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

// ---------------------------------------------------------------------------
// JSON Schema for structured output (mirrors PRDSchema from @agentforge/core)
// ---------------------------------------------------------------------------

const PRD_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      features: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['must-have', 'should-have', 'could-have', 'wont-have'],
            },
          },
          required: ['id', 'name', 'description'],
          additionalProperties: false,
        },
      },
      personas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            goals: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'name', 'role', 'goals'],
          additionalProperties: false,
        },
      },
      dataEntities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  required: { type: 'boolean' },
                  description: { type: 'string' },
                },
                required: ['name', 'type'],
                additionalProperties: false,
              },
            },
            relationships: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'name', 'fields'],
          additionalProperties: false,
        },
      },
      screens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            screenType: {
              type: 'string',
              enum: ['page', 'modal', 'drawer', 'sheet'],
            },
          },
          required: ['id', 'name', 'description'],
          additionalProperties: false,
        },
      },
      nfrs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            target: { type: 'string' },
            measurement: { type: 'string' },
          },
          required: ['id', 'category', 'description'],
          additionalProperties: false,
        },
      },
      successMetrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            target: { type: 'string' },
            measurement: { type: 'string' },
          },
          required: ['id', 'name', 'description', 'target', 'measurement'],
          additionalProperties: false,
        },
      },
      outOfScope: { type: 'array', items: { type: 'string' } },
      version: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'reviewed', 'approved'] },
    },
    required: [
      'id',
      'title',
      'description',
      'features',
      'personas',
      'dataEntities',
      'screens',
      'nfrs',
      'successMetrics',
      'outOfScope',
      'version',
      'status',
    ],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// User message construction
// ---------------------------------------------------------------------------

function buildUserMessage(state: ClarifierState): string {
  const parts: string[] = [];

  parts.push(`## Mode: ${state.mode}`);
  parts.push(`\n## Raw Input\n\n${state.rawInput}`);

  if (state.context.catalog) {
    parts.push(`\n## Available Component Catalog\n\n${state.context.catalog}`);
  }
  if (state.context.platformConstraints) {
    parts.push(`\n## Platform Constraints\n\n${state.context.platformConstraints}`);
  }

  if (state.mode === 'evolution') {
    if (state.context.codeChunks?.length) {
      parts.push(
        `\n## Existing Code Context\n\n${state.context.codeChunks.join('\n\n---\n\n')}`,
      );
    }
    if (state.context.docChunks?.length) {
      parts.push(
        `\n## Existing Documentation\n\n${state.context.docChunks.join('\n\n---\n\n')}`,
      );
    }
    if (state.context.designChunks?.length) {
      parts.push(
        `\n## Existing Designs\n\n${state.context.designChunks.join('\n\n---\n\n')}`,
      );
    }
    if (state.context.repoMap) {
      parts.push(`\n## Repository Structure\n\n${state.context.repoMap}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a PRD Analyzer node function for the Clarifier StateGraph.
 * Forced-JSON extraction of features, personas, data entities, screens, NFRs.
 */
export function createPrdAnalyzer(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    const _t0 = Date.now();
    debugLog(`prd-analyzer: ENTER round=${state.round}`);
    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();

    const userMessage = buildUserMessage(state);

    debugLog('prd-analyzer: LLM call START (claude-opus-4-6)');
    const result = await deps.provider.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        model: 'claude-opus-4-6',
        maxTokens: 8192,
        temperature: 0,
        responseSchema: PRD_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`prd-analyzer: LLM call END ${Date.now() - _t0}ms ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`prd-analyzer: LLM call failed: ${result.error.code}`);
      return { error: `PRD Analyzer LLM call failed: ${result.error.code}` };
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
        debugLog('prd-analyzer: response is not valid JSON');
        return { error: 'PRD Analyzer: response is not valid JSON' };
      }
    }

    const parsed = PRDSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      debugLog(`prd-analyzer: schema validation failed: ${issues}`);
      return { error: `PRD Analyzer: invalid response: ${issues}` };
    }

    debugLog(`prd-analyzer: EXIT features=${parsed.data.features.length} screens=${parsed.data.screens.length} ${Date.now() - _t0}ms`);
    return { prdDraft: parsed.data };
  };
}

export { PRD_RESPONSE_SCHEMA, buildUserMessage, loadSystemPrompt, getPromptVersion };
