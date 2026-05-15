/**
 * @module @agentforge/agents-architect/graph/nodes/contract-designer/design-system-diff
 *
 * Node 4.5 — Design System Specialist.
 * Produces DesignSystemDiff via buildDesignSystemContext() (peer import from agents-ux).
 * Skips LLM call when deps.designSystemContext is pre-built.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
} from '@agentforge/core';
import type { DesignSystemDiff } from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../../deps.js';
import type { ArchitectStateType } from '../../state.js';

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'prompts', 'contract-designer', 'design-system-diff.md',
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

export function _resetDesignSystemDiffPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

const DesignSystemDiffLlmOutputSchema = z.object({
  addedTokens: z.array(z.string()),
  modifiedTokens: z.array(z.string()),
  removedTokens: z.array(z.string()),
  themeStrategy: z.string().optional(),
});

export const DESIGN_SYSTEM_DIFF_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      addedTokens: { type: 'array', items: { type: 'string' } },
      modifiedTokens: { type: 'array', items: { type: 'string' } },
      removedTokens: { type: 'array', items: { type: 'string' } },
      themeStrategy: { type: 'string' },
    },
    required: ['addedTokens', 'modifiedTokens', 'removedTokens'],
  },
};

/** Build design-system-diff specialist user message (exported for wiring tests). */
export function buildDesignSystemDiffUserMessage(state: ArchitectStateType, deps: ArchitectDeps): string {
  const parts: string[] = [];

  parts.push(`## Project mode\n${state.mode}`);

  if (state.architectureSpec) {
    parts.push('\n## Stack config\n');
    parts.push(JSON.stringify(state.architectureSpec.stackConfig, null, 2));
    if (state.architectureSpec.implementationPatterns?.length) {
      const tokenPatterns = state.architectureSpec.implementationPatterns
        .filter((p) => p.category === 'styling' || p.id.includes('token') || p.id.includes('tailwind'));
      if (tokenPatterns.length > 0) {
        parts.push('\n## Relevant styling patterns\n');
        parts.push(tokenPatterns.map((p) => `- ${p.id}: ${p.rule}`).join('\n'));
      }
    }
  }

  if (state.componentCompositions.length > 0) {
    parts.push('\n## Component compositions (from Node 4.3)\n');
    parts.push(JSON.stringify(state.componentCompositions, null, 2));
  }

  if (state.screenPlans.length > 0) {
    parts.push('\n## Screen plans (from Node 4.4)\n');
    parts.push(JSON.stringify(state.screenPlans, null, 2));
  }

  if (deps.designSystemContext) {
    parts.push('\n## Existing design system context (baseline)\n');
    parts.push(deps.designSystemContext.designSystemPrompt);
  }

  if (state.changeClassification) {
    parts.push('\n## Change classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

/** Create Node 4.5 — Design System Specialist. */
export function createDesignSystemDiffSpecialist(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('contractDesigner/designSystemDiff: ENTER');

    if (!state.architectureSpec) {
      debugLog('contractDesigner/designSystemDiff: EXIT (no architectureSpec)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    const userMessage = buildDesignSystemDiffUserMessage(state, deps);

    debugLog('contractDesigner/designSystemDiff: LLM call START (claude-sonnet-4-6)');
    const result = await deps.provider.complete(
      { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
      {
        model: 'claude-sonnet-4-6',
        maxTokens: 2048,
        temperature: 0,
        responseSchema: DESIGN_SYSTEM_DIFF_RESPONSE_SCHEMA,
        promptVersion,
      },
    );

    debugLog(`contractDesigner/designSystemDiff: LLM call END ok=${result.ok}`);
    if (!result.ok) {
      debugLog(`contractDesigner/designSystemDiff: LLM failed ${result.error.code}`);
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
        debugLog('contractDesigner/designSystemDiff: response is not valid JSON');
        return {};
      }
    }

    const parsed = DesignSystemDiffLlmOutputSchema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      debugLog(`contractDesigner/designSystemDiff: schema validation failed: ${issues}`);
      return {};
    }

    const diff: DesignSystemDiff = parsed.data;
    debugLog(
      `contractDesigner/designSystemDiff: EXIT added=${diff.addedTokens.length} modified=${diff.modifiedTokens.length} removed=${diff.removedTokens.length}`,
    );
    return { designSystemDiff: diff };
  };
}

export { DesignSystemDiffLlmOutputSchema };
