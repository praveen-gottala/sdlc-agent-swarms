/**
 * @module @agentforge/agents-clarifier/nodes/gap-detector
 *
 * Gap/Conflict Detector node (Task 1.3).
 * Pass 1 (deterministic): checklist for auth, validation, error states, etc.
 * Pass 2 (ClarifyGPT): 3 plausible implementations, divergence = gap.
 * Model: claude-sonnet-4-6. Cost cap: 3 extra LLM calls.
 * All LLM calls via TracedProvider (ADR-046).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePromptFrontmatter, debugLog } from '@agentforge/core';
import type { PRD } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState, Gap } from '../types.js';

// ---------------------------------------------------------------------------
// Prompt loading (cached, lazy)
// ---------------------------------------------------------------------------

let implPromptCache: string | undefined;
let implVersionCache: string | undefined;
let divergePromptCache: string | undefined;
let divergeVersionCache: string | undefined;

function promptDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
}

function loadImplPrompt(): string {
  if (implPromptCache) return implPromptCache;
  const raw = readFileSync(join(promptDir(), 'gap-detector-system.md'), 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  implPromptCache = parsed.body;
  implVersionCache = parsed.frontmatter.version;
  return implPromptCache;
}

function loadDivergePrompt(): string {
  if (divergePromptCache) return divergePromptCache;
  const raw = readFileSync(join(promptDir(), 'gap-divergence-system.md'), 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  divergePromptCache = parsed.body;
  divergeVersionCache = parsed.frontmatter.version;
  return divergePromptCache;
}

/** Reset cached prompts — test-only. */
export function _resetPromptCache(): void {
  implPromptCache = undefined;
  implVersionCache = undefined;
  divergePromptCache = undefined;
  divergeVersionCache = undefined;
}

// ---------------------------------------------------------------------------
// JSON Schemas for structured LLM output
// ---------------------------------------------------------------------------

const IMPL_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      implementations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            approach: { type: 'string' },
            keyDecisions: { type: 'array', items: { type: 'string' } },
          },
          required: ['approach', 'keyDecisions'],
          additionalProperties: false,
        },
      },
    },
    required: ['implementations'],
    additionalProperties: false,
  },
};

const DIVERGE_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    properties: {
      gaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            category: {
              type: 'string',
              enum: ['missing', 'ambiguous', 'conflicting', 'incomplete'],
            },
            interpretations: { type: 'array', items: { type: 'string' } },
          },
          required: ['description', 'category', 'interpretations'],
          additionalProperties: false,
        },
      },
    },
    required: ['gaps'],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Pass 1: Deterministic checklist
// ---------------------------------------------------------------------------

const AUTH_KEYWORDS = ['login', 'auth', 'sign in', 'sign up', 'register', 'password', 'session', 'token', 'oauth'];
const USER_DATA_KEYWORDS = ['user', 'account', 'profile', 'personal', 'private'];
const FORM_KEYWORDS = ['form', 'input', 'submit', 'add', 'create', 'edit', 'update'];
const ACCESSIBILITY_KEYWORDS = ['accessibility', 'a11y', 'wcag', 'screen reader', 'aria'];

function hasKeywords(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function prdText(prd: PRD): string {
  const parts = [
    prd.title,
    prd.description,
    ...prd.features.map((f) => `${f.name} ${f.description}`),
    ...prd.screens.map((s) => `${s.name} ${s.description}`),
    ...prd.nfrs.map((n) => `${n.category} ${n.description}`),
  ];
  return parts.join(' ');
}

function runDeterministicChecklist(prd: PRD): Gap[] {
  const gaps: Gap[] = [];
  const fullText = prdText(prd);
  let idx = 0;

  const hasUserData = hasKeywords(fullText, USER_DATA_KEYWORDS);
  const hasAuth = hasKeywords(fullText, AUTH_KEYWORDS) ||
    prd.features.some((f) => hasKeywords(`${f.name} ${f.description}`, AUTH_KEYWORDS));

  if (hasUserData && !hasAuth) {
    gaps.push({
      id: `det-missing-${idx++}`,
      description: 'PRD references user data but does not specify an authentication strategy.',
      category: 'missing',
      confidence: 0.9,
      deterministic: true,
    });
  }

  const hasForms = hasKeywords(fullText, FORM_KEYWORDS) ||
    prd.screens.some((s) => hasKeywords(`${s.name} ${s.description}`, FORM_KEYWORDS));
  const hasValidationNFR = prd.nfrs.some((n) =>
    hasKeywords(`${n.category} ${n.description}`, ['validation', 'validate', 'constraint']),
  );
  if (hasForms && !hasValidationNFR) {
    gaps.push({
      id: `det-missing-${idx++}`,
      description: 'PRD includes form-based screens but no validation rules or constraints are specified.',
      category: 'missing',
      confidence: 0.7,
      deterministic: true,
    });
  }

  const hasErrorHandling = hasKeywords(fullText, ['error', 'failure', 'fallback', 'retry', 'empty state']);
  if (!hasErrorHandling) {
    gaps.push({
      id: `det-missing-${idx++}`,
      description: 'PRD does not specify error handling, empty states, or failure recovery flows.',
      category: 'missing',
      confidence: 0.6,
      deterministic: true,
    });
  }

  const nfrsWithoutTargets = prd.nfrs.filter((n) => !n.target);
  if (nfrsWithoutTargets.length > 0) {
    gaps.push({
      id: `det-incomplete-${idx++}`,
      description: `${nfrsWithoutTargets.length} NFR(s) lack measurable targets: ${nfrsWithoutTargets.map((n) => n.category).join(', ')}.`,
      category: 'incomplete',
      confidence: 0.8,
      deterministic: true,
    });
  }

  const hasAccessibility = hasKeywords(fullText, ACCESSIBILITY_KEYWORDS) ||
    prd.nfrs.some((n) => hasKeywords(`${n.category} ${n.description}`, ACCESSIBILITY_KEYWORDS));
  if (!hasAccessibility) {
    gaps.push({
      id: `det-missing-${idx++}`,
      description: 'PRD does not mention accessibility requirements (WCAG, screen readers, keyboard navigation).',
      category: 'missing',
      confidence: 0.5,
      deterministic: true,
    });
  }

  const featureScreens = new Set(
    prd.features.flatMap((f) => {
      const lower = `${f.name} ${f.description}`.toLowerCase();
      return prd.screens.filter((s) => lower.includes(s.name.toLowerCase())).map((s) => s.id);
    }),
  );
  const orphanScreens = prd.screens.filter((s) => !featureScreens.has(s.id));
  if (orphanScreens.length > 0 && prd.screens.length > 1) {
    gaps.push({
      id: `det-ambiguous-${idx++}`,
      description: `${orphanScreens.length} screen(s) not clearly linked to any feature: ${orphanScreens.map((s) => s.name).join(', ')}.`,
      category: 'ambiguous',
      confidence: 0.4,
      deterministic: true,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// Pass 2: ClarifyGPT (LLM-based divergence analysis)
// ---------------------------------------------------------------------------

interface ImplResponse {
  readonly implementations: readonly {
    readonly approach: string;
    readonly keyDecisions: readonly string[];
  }[];
}

interface DivergeResponse {
  readonly gaps: readonly {
    readonly description: string;
    readonly category: 'missing' | 'ambiguous' | 'conflicting' | 'incomplete';
    readonly interpretations: readonly string[];
  }[];
}

function extractStructured<T>(result: { structured?: Record<string, unknown>; content: string }): T | null {
  if (result.structured) return result.structured as T;
  try {
    const cleaned = result.content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

async function runClarifyGPT(
  deps: ClarifierDeps,
  prd: PRD,
): Promise<Gap[]> {
  const implSystem = loadImplPrompt();
  const prdSummary = `Title: ${prd.title}\nDescription: ${prd.description}\n\nFeatures:\n${prd.features.map((f) => `- ${f.name}: ${f.description}`).join('\n')}\n\nScreens:\n${prd.screens.map((s) => `- ${s.name}: ${s.description}`).join('\n')}\n\nData Entities:\n${prd.dataEntities.map((e) => `- ${e.name}: fields=[${e.fields.map((f) => f.name).join(', ')}]`).join('\n')}`;

  const implResult = await deps.provider.complete(
    {
      system: implSystem,
      messages: [{ role: 'user', content: `## PRD\n\n${prdSummary}\n\nGenerate exactly 3 distinct implementation approaches.` }],
    },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0.7,
      responseSchema: IMPL_RESPONSE_SCHEMA,
      promptVersion: implVersionCache,
    },
  );

  if (!implResult.ok) {
    debugLog(`gap-detector: implementation generation failed: ${implResult.error.code}`);
    return [];
  }

  const implData = extractStructured<ImplResponse>(implResult.value);
  if (!implData?.implementations?.length) {
    debugLog('gap-detector: could not parse implementation response');
    return [];
  }

  const divergeSystem = loadDivergePrompt();
  const implSummary = implData.implementations
    .map((impl, i) => `### Approach ${i + 1}\n${impl.approach}\nKey decisions: ${impl.keyDecisions.join('; ')}`)
    .join('\n\n');

  const divergeResult = await deps.provider.complete(
    {
      system: divergeSystem,
      messages: [{ role: 'user', content: `## PRD\n\n${prdSummary}\n\n## Implementation Approaches\n\n${implSummary}\n\nIdentify where these approaches diverge. Each divergence is a gap in the PRD.` }],
    },
    {
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      temperature: 0,
      responseSchema: DIVERGE_RESPONSE_SCHEMA,
      promptVersion: divergeVersionCache,
    },
  );

  if (!divergeResult.ok) {
    debugLog(`gap-detector: divergence analysis failed: ${divergeResult.error.code}`);
    return [];
  }

  const divergeData = extractStructured<DivergeResponse>(divergeResult.value);
  if (!divergeData?.gaps?.length) {
    debugLog('gap-detector: no divergence gaps found');
    return [];
  }

  return divergeData.gaps.map((g, i) => ({
    id: `llm-${i}`,
    description: g.description,
    category: g.category,
    confidence: 0.6,
    deterministic: false,
    divergentInterpretations: [...g.interpretations],
  }));
}

// ---------------------------------------------------------------------------
// Round>1 filtering
// ---------------------------------------------------------------------------

function filterAddressedGaps(
  gaps: readonly Gap[],
  questions: readonly ClarifierState['questions'][number][],
  humanResponses: readonly ClarifierState['humanResponses'][number][],
): Gap[] {
  const answeredQuestionIds = new Set(humanResponses.map((r) => r.questionId));
  const answeredGapIds = new Set(
    questions.filter((q) => answeredQuestionIds.has(q.id)).map((q) => q.gapId),
  );
  return gaps.filter((g) => !answeredGapIds.has(g.id));
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a Gap Detector node function for the Clarifier StateGraph.
 * Two-pass analysis: deterministic checklist + ClarifyGPT divergence.
 */
export function createGapDetector(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    if (!state.prdDraft) {
      return { error: 'Gap Detector: no PRD draft available', round: state.round + 1 };
    }

    let deterministicGaps = runDeterministicChecklist(state.prdDraft);
    let llmGaps: Gap[] = [];

    if (state.round > 0) {
      deterministicGaps = filterAddressedGaps(deterministicGaps, state.questions, state.humanResponses);
    }

    try {
      llmGaps = await runClarifyGPT(deps, state.prdDraft);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog(`gap-detector: ClarifyGPT failed: ${msg}`);
    }

    if (state.round > 0 && llmGaps.length > 0) {
      llmGaps = filterAddressedGaps(llmGaps, state.questions, state.humanResponses);
    }

    const existingDescriptions = new Set(deterministicGaps.map((g) => g.description.toLowerCase()));
    const dedupedLlmGaps = llmGaps.filter(
      (g) => !existingDescriptions.has(g.description.toLowerCase()),
    );

    const allGaps = [...deterministicGaps, ...dedupedLlmGaps];

    return { gaps: allGaps, round: state.round + 1 };
  };
}

export {
  runDeterministicChecklist,
  filterAddressedGaps,
  runClarifyGPT,
  extractStructured,
  IMPL_RESPONSE_SCHEMA,
  DIVERGE_RESPONSE_SCHEMA,
};
