/**
 * @module @agentforge/agents-architect/graph/nodes/architecture-writer
 *
 * Node 3 — Architecture & ADR Writer (incl. implementation patterns).
 * Single Opus call with structured output; merges LLM patterns with baseline catalog.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  ArchitectureDecisionSchema,
  ADRSchema,
  ImplementationPatternSchema,
  ArchitectStackConfigSchema,
} from '@agentforge/core';
import type { ArchitectureSpec } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';
import { BASELINE_IMPLEMENTATION_PATTERNS, mergeImplementationPatterns } from '../../patterns/baseline.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'prompts', 'architecture-writer.md');
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
export function _resetArchitectureWriterPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const ArchitectureWriterLlmOutputSchema = z.object({
  decisions: z.array(ArchitectureDecisionSchema),
  adrs: z.array(ADRSchema),
  implementationPatterns: z.array(ImplementationPatternSchema),
  stackConfig: ArchitectStackConfigSchema,
});

/** JSON Schema for provider structured output (hand-authored — mirrors Zod above). */
export const ARCHITECTURE_WRITER_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      decisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            gapId: { type: 'string' },
            chosenAlternativeId: { type: 'string' },
            rationale: { type: 'string' },
            adrId: { type: 'string' },
          },
          required: ['gapId', 'chosenAlternativeId', 'rationale'],
        },
      },
      adrs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            status: { type: 'string', enum: ['proposed', 'accepted', 'superseded'] },
            decision: { type: 'string' },
            rationale: { type: 'string' },
            alternatives: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'title', 'status', 'decision', 'rationale'],
        },
      },
      implementationPatterns: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            category: { type: 'string' },
            title: { type: 'string' },
            rule: { type: 'string' },
            rationale: { type: 'string' },
            example: { type: 'string' },
            forbids: { type: 'array', items: { type: 'string' } },
            appliesTo: { type: 'array', items: { type: 'string' } },
          },
          required: ['id', 'category', 'title', 'rule'],
        },
      },
      stackConfig: {
        type: 'object',
        additionalProperties: false,
        properties: {
          frontend: { type: 'string' },
          backend: { type: 'string' },
          database: { type: 'string' },
          styling: { type: 'string' },
          componentLibrary: { type: 'string' },
        },
        required: ['frontend', 'backend', 'database', 'styling'],
      },
    },
    required: ['decisions', 'adrs', 'implementationPatterns', 'stackConfig'],
  },
};

/** Build Node 3 user message (exported for wiring tests). */
export function buildArchitectureWriterUserMessage(state: ArchitectStateType): string {
  const parts: string[] = [];

  parts.push(`## Project mode\n${state.mode}`);

  if (state.enrichedRequirement) {
    parts.push('\n## Enriched requirement (summary JSON)\n');
    parts.push(JSON.stringify(state.enrichedRequirement, null, 2));
  }

  if (state.assumptionLedger) {
    parts.push('\n## Assumption ledger\n');
    parts.push(JSON.stringify(state.assumptionLedger, null, 2));
  }

  if (state.constraintSet) {
    parts.push('\n## Constraint set\n');
    parts.push(JSON.stringify(state.constraintSet, null, 2));
  }

  if (state.optionsBundle) {
    parts.push('\n## Options bundle (Node 2 — required for decisions)\n');
    parts.push(JSON.stringify(state.optionsBundle, null, 2));
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  if (state.gate2Edits?.architectureSpec) {
    parts.push('\n## Gate 2 partial edits (architectureSpec slice)\n');
    parts.push(JSON.stringify(state.gate2Edits.architectureSpec, null, 2));
  }

  parts.push('\n## Baseline implementation pattern catalog\n');
  parts.push(
    BASELINE_IMPLEMENTATION_PATTERNS.map((p) => `- ${p.id}: ${p.title}`).join('\n'),
  );

  return parts.join('\n');
}

/** Create Node 3 — Architecture & ADR Writer. */
export function createArchitectureWriter(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('architectureWriter: ENTER');

    if (!state.optionsBundle?.memos.length) {
      debugLog('architectureWriter: EXIT (no options memos)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildArchitectureWriterUserMessage(state);

    debugLog('architectureWriter: LLM call START (claude-opus-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-opus-4-6',
        maxTokens: 8192,
        temperature: 0,
        responseSchema: ARCHITECTURE_WRITER_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`architectureWriter: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`architectureWriter: LLM failed ${result.error.code}`);
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
        debugLog('architectureWriter: response is not valid JSON');
        return {};
      }
    }

    const parsed = ArchitectureWriterLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`architectureWriter: schema validation failed: ${issues}`);
      return {};
    }

    const mergedPatterns = mergeImplementationPatterns(
      BASELINE_IMPLEMENTATION_PATTERNS,
      parsed.data.implementationPatterns,
    );

    const architectureSpec: ArchitectureSpec = {
      projectId: deps.projectId,
      decisions: parsed.data.decisions,
      stackConfig: parsed.data.stackConfig,
      assumptionLedgerUpdates: [],
      implementationPatterns: mergedPatterns,
    };

    debugLog(
      `architectureWriter: EXIT decisions=${architectureSpec.decisions.length} adrs=${parsed.data.adrs.length} patterns=${mergedPatterns.length}`,
    );

    return { architectureSpec, adrs: parsed.data.adrs };
  };
}

export { ArchitectureWriterLlmOutputSchema };
