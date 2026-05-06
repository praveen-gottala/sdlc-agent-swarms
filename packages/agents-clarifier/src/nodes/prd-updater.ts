/**
 * @module @agentforge/agents-clarifier/nodes/prd-updater
 *
 * PRD Updater node — merges human clarification answers into prdDraft
 * before the next gap detection round, preventing circular questioning.
 * Model: claude-sonnet-4-6. All LLM calls via TracedProvider (ADR-046).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRDSchema, parsePromptFrontmatter, debugLog } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState } from '../types.js';
import { PRD_RESPONSE_SCHEMA } from './prd-analyzer.js';

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
    'prd-updater-system.md',
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
// User message construction
// ---------------------------------------------------------------------------

function buildQAPairs(
  state: ClarifierState,
): readonly { question: string; answer: string }[] {
  return state.humanResponses.map((r) => {
    const q = state.questions.find((qq) => qq.id === r.questionId);
    return {
      question: q?.text ?? `[Question ${r.questionId}]`,
      answer: r.selectedOption
        ? `${r.answer} (selected: ${r.selectedOption})`
        : r.answer,
    };
  });
}

function buildUserMessage(state: ClarifierState): string {
  const parts: string[] = [];

  parts.push('## Current PRD\n');
  parts.push('```json');
  parts.push(JSON.stringify(state.prdDraft, null, 2));
  parts.push('```');

  const qaPairs = buildQAPairs(state);
  if (qaPairs.length > 0) {
    parts.push('\n## Clarification Answers\n');
    for (const pair of qaPairs) {
      parts.push(`**Q:** ${pair.question}`);
      parts.push(`**A:** ${pair.answer}\n`);
    }
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/**
 * Create a PRD Updater node function for the Clarifier StateGraph.
 * Merges human answers into prdDraft so the next gap detection round
 * sees an evolved PRD, preventing circular questioning.
 */
export function createPrdUpdater(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    const _t0 = Date.now();
    debugLog(`prd-updater: ENTER round=${state.round} humanResponses=${state.humanResponses.length} features=${state.prdDraft?.features?.length ?? 0}`);
    if (!state.prdDraft) {
      debugLog('prd-updater: no prdDraft to update, skipping');
      return {};
    }

    if (state.humanResponses.length === 0) {
      debugLog('prd-updater: no human responses yet, skipping');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildUserMessage(state);

    debugLog('prd-updater: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 8192,
        temperature: 0,
        responseSchema: PRD_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`prd-updater: LLM call END ${Date.now() - _t0}ms ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`prd-updater: LLM call failed: ${result.error.code}, keeping old prdDraft`);
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
        debugLog('prd-updater: response is not valid JSON, keeping old prdDraft');
        return {};
      }
    }

    const parsed = PRDSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      debugLog(`prd-updater: schema validation failed: ${issues}, keeping old prdDraft`);
      return {};
    }

    debugLog(`prd-updater: EXIT features=${parsed.data.features.length} ${Date.now() - _t0}ms`);
    return { prdDraft: parsed.data };
  };
}

export { buildQAPairs, buildUserMessage };
