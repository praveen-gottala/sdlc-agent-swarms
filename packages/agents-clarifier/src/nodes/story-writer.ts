/**
 * @module @agentforge/agents-clarifier/nodes/story-writer
 *
 * Story Writer / PRD Synthesizer node (Task 1.5).
 * Produces EnrichedRequirement + FeaturePlan + updated AssumptionLedger.
 * EARS format acceptance criteria, INVEST-compliant stories, typed feature DAG.
 * Mode branching: bootstrap=completeness, evolution=impact.
 * Model: claude-sonnet-4-6. All LLM calls via TracedProvider (ADR-046).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePromptFrontmatter, debugLog } from '@agentforge/core';
import type { EnrichedRequirement, FeaturePlan, AssumptionLedger } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState } from '../types.js';

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'prompts',
    'story-writer-system.md',
  );
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version;
  return systemPromptCache;
}

/** Reset cached prompt — test-only. */
export function _resetPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

// ---------------------------------------------------------------------------
// JSON Schema for structured output
// ---------------------------------------------------------------------------

const STORY_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      features: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            featureId: { type: 'string' },
            acceptanceCriteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  condition: { type: 'string' },
                  behavior: { type: 'string' },
                },
                required: ['condition', 'behavior'],
                additionalProperties: false,
              },
            },
            dependencies: { type: 'array', items: { type: 'string' } },
          },
          required: ['featureId', 'acceptanceCriteria', 'dependencies'],
          additionalProperties: false,
        },
      },
      confidence: { type: 'number' },
    },
    required: ['features', 'confidence'],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

interface StoryResponse {
  readonly features: readonly {
    readonly featureId: string;
    readonly acceptanceCriteria: readonly {
      readonly condition: string;
      readonly behavior: string;
    }[];
    readonly dependencies: readonly string[];
  }[];
  readonly confidence: number;
}

function extractStructured(result: { structured?: Record<string, unknown>; content: string }): StoryResponse | null {
  const raw = result.structured ?? (() => {
    try {
      const cleaned = result.content
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  })();
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.features) || typeof obj.confidence !== 'number') return null;
  return obj as unknown as StoryResponse;
}

// ---------------------------------------------------------------------------
// User message construction
// ---------------------------------------------------------------------------

function buildUserMessage(state: ClarifierState): string {
  const parts: string[] = [];
  parts.push(`## Mode: ${state.mode}`);

  if (state.prdDraft) {
    const prd = state.prdDraft;
    parts.push(`\n## PRD\n\nTitle: ${prd.title}\nDescription: ${prd.description}`);
    parts.push(`\n### Features\n${prd.features.map((f) => `- **${f.name}** (${f.id}): ${f.description}${f.priority ? ` [${f.priority}]` : ''}`).join('\n')}`);
    parts.push(`\n### Screens\n${prd.screens.map((s) => `- **${s.name}** (${s.id}): ${s.description}`).join('\n')}`);
    parts.push(`\n### Data Entities\n${prd.dataEntities.map((e) => `- **${e.name}**: ${e.fields.map((f) => f.name).join(', ')}`).join('\n')}`);
  }

  if (state.humanResponses.length > 0) {
    parts.push('\n## Human Clarifications\n');
    for (const response of state.humanResponses) {
      const question = state.questions.find((q) => q.id === response.questionId);
      const questionText = question?.text ?? `[Question ${response.questionId}]`;
      parts.push(`**Q:** ${questionText}\n**A:** ${response.answer}\n`);
    }
  }

  if (state.gaps.length > 0) {
    const unresolved = state.gaps.filter((g) => {
      const question = state.questions.find((q) => q.gapId === g.id);
      if (!question) return true;
      return !state.humanResponses.some((r) => r.questionId === question.id);
    });
    if (unresolved.length > 0) {
      parts.push(`\n## Unresolved Gaps (${unresolved.length})\n${unresolved.map((g) => `- ${g.description} [${g.category}]`).join('\n')}`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Assembly helpers
// ---------------------------------------------------------------------------

function assembleFeaturePlan(
  response: StoryResponse,
  state: ClarifierState,
): FeaturePlan {
  const prdFeatures = state.prdDraft?.features ?? [];
  let criterionCounter = 0;

  const features = response.features.map((rf) => {
    const prdFeature = prdFeatures.find((f) => f.id === rf.featureId);
    return {
      id: rf.featureId,
      name: prdFeature?.name ?? rf.featureId,
      description: prdFeature?.description ?? '',
      acceptanceCriteria: rf.acceptanceCriteria.map((ac) => ({
        id: `ears-${criterionCounter++}`,
        condition: ac.condition,
        behavior: ac.behavior,
        formatted: `WHEN ${ac.condition} THE SYSTEM SHALL ${ac.behavior}`,
      })),
      priority: (prdFeature?.priority ?? 'should-have') as 'must-have' | 'should-have' | 'could-have' | 'wont-have',
      dependencies: [...rf.dependencies],
      status: 'planned' as const,
    };
  });

  return { id: `plan-${Date.now()}`, features };
}

function assembleEnrichedRequirement(
  state: ClarifierState,
  confidence: number,
  assumptions: AssumptionLedger,
): EnrichedRequirement {
  return {
    id: `req-${Date.now()}`,
    rawInput: state.rawInput,
    mode: state.mode,
    prd: state.prdDraft!,
    assumptionLedger: assumptions,
    clarificationRounds: [{
      round: Math.max(state.round, 1),
      questionsAsked: state.questions.length,
      questionsAnswered: state.humanResponses.length,
      timestamp: new Date().toISOString(),
    }],
    confidence,
    createdAt: new Date().toISOString(),
  };
}

function finalizeAssumptions(
  state: ClarifierState,
  isMaxRounds: boolean,
): AssumptionLedger {
  const existing = state.assumptions;
  const now = new Date().toISOString();
  const entries = existing?.entries ? [...existing.entries] : [];

  if (isMaxRounds) {
    const answeredGapIds = new Set(
      state.humanResponses
        .map((r) => state.questions.find((q) => q.id === r.questionId)?.gapId)
        .filter(Boolean),
    );
    const unresolved = state.gaps.filter((g) => !answeredGapIds.has(g.id));
    const existingIds = new Set(entries.map((e) => e.id));

    for (const gap of unresolved) {
      const id = `assumption-unresolved-${gap.id}`;
      if (existingIds.has(id)) continue;
      entries.push({
        id,
        statement: `Unresolved after max rounds: ${gap.description}`,
        evidence: 'Max clarification rounds exhausted without human answer.',
        confidence: 0.3,
        blastRadius: gap.category === 'missing' || gap.category === 'conflicting' ? 'high' : 'low',
        requiresConfirmation: true,
      });
    }
  }

  return {
    id: existing?.id ?? `ledger-${Date.now()}`,
    entries,
    createdAt: existing?.createdAt ?? now,
    lastUpdatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a Story Writer node function for the Clarifier StateGraph.
 * Produces EnrichedRequirement + FeaturePlan + AssumptionLedger.
 */
export function createStoryWriter(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    const _t0 = Date.now();
    debugLog(`story-writer: ENTER round=${state.round} maxRounds=${state.maxRounds} humanResponses=${state.humanResponses.length} features=${state.prdDraft?.features?.length ?? 0}`);
    if (!state.prdDraft) {
      return { error: 'Story Writer: no PRD draft available' };
    }

    const isMaxRounds = state.round >= state.maxRounds;
    const systemPrompt = loadSystemPrompt();

    const userMessage = buildUserMessage(state);

    debugLog('story-writer: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        temperature: 0,
        responseSchema: STORY_RESPONSE_SCHEMA,
        promptVersion: promptVersionCache,
      },
    );

    debugLog(`story-writer: LLM call END ${Date.now() - _t0}ms ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`story-writer: LLM call failed: ${result.error.code}`);
      return { error: `Story Writer LLM call failed: ${result.error.code}` };
    }

    const response = extractStructured(result.value);
    if (!response) {
      debugLog('story-writer: could not parse response');
      return { error: 'Story Writer: could not parse LLM response' };
    }

    const featurePlan = assembleFeaturePlan(response, state);
    const confidence = isMaxRounds ? Math.min(response.confidence, 0.5) : response.confidence;
    const assumptions = finalizeAssumptions(state, isMaxRounds);
    const requirement = assembleEnrichedRequirement(state, confidence, assumptions);

    debugLog(`story-writer: EXIT confidence=${confidence} features=${featurePlan.features.length} ${Date.now() - _t0}ms`);
    return { requirement, featurePlan, assumptions };
  };
}

export {
  buildUserMessage,
  assembleFeaturePlan,
  assembleEnrichedRequirement,
  finalizeAssumptions,
  extractStructured,
  STORY_RESPONSE_SCHEMA,
};
