/**
 * @module browser-design-work
 *
 * Superset of callClaudeDesignAPI (dashboard) — NOT a 1:1 refactor.
 * Adds Chrome Pass, screen_type, viewport enforcement, navigateTo propagation
 * which callClaudeDesignAPI never had. Phase 3's dashboard parity baseline
 * must use chromePass: undefined to compare apples to apples.
 *
 * Phase A only — LLM generation via tool use. Does NOT include browser
 * correction (Phase B/C). Works identically on both Vertex AI and direct API.
 */

import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Err, Ok } from '@agentforge/core';
import type { Result } from '@agentforge/core';
import { debugLog } from '@agentforge/core';
import { SUBMIT_DESIGN_TOOL } from '@agentforge/designspec-renderer';
import { extractDesignSpecFromToolCall } from '../ux-design/penpot-script-executor.js';
import { buildPromptFromTokens } from '../prompts/prompt-template-builder.js';
import { formatPageContextPrompt } from '../page-context-prompt.js';
import type { DesignPhaseState, NodeContext, PipelineStageError } from './types.js';
import { pipelineStageError } from './types.js';

const MAX_EMPTY_NODES_RETRIES = 1;

// ── System prompt loading (cached) ──

let systemPromptCache: string | undefined;

function loadDesignSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', 'prompts', 'ux-penpot-designspec-v2.md',
  );
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
}

// ── User message construction ──

/** @internal Exported for equivalence pin test. */
export function buildBrowserDesignUserMessage(state: DesignPhaseState): string {
  const parts: string[] = [`Module ID: ${state.moduleId}`];

  if (state.viewportWidth) {
    parts.push(`\nViewport Width: ${state.viewportWidth}px`);
    parts.push(`IMPORTANT: The root page node MUST have width: ${state.viewportWidth}.`);
  }

  if (state.description) {
    parts.push(`\nApp Description: ${state.description}`);
    if (state.chromePass?.mode === 'generate') {
      parts.push(
        '\nIMPORTANT: This is a chrome-only pass. Design only the shared shell in the planning output. No page body, no feature content, no cards outside the shell.'
        + '\n\nYou MUST include a "regions" field in the submit_design tool call that maps each root-level node to its layout region.'
        + '\nExample: { "regions": { "header": ["nav-header"], "footer": ["tab-bar"] } }'
        + '\nUse "header" for top navigation bars, "footer" for bottom tab bars, "sidebar" for side navigation. Every root child must appear in exactly one region.',
      );
    } else {
      parts.push(
        '\nIMPORTANT: Design this screen for the app described above. Populate all text with realistic, domain-appropriate content.',
      );
    }
  }

  const screenType = state.pageContext?.targetPage?.screen_type;
  if (screenType && screenType !== 'page') {
    parts.push(`\nScreen Type: ${screenType}`);
    parts.push(`IMPORTANT: Set screenType: "${screenType}" in the submit_design tool call.`);
  }

  parts.push(`\n## Navigation Propagation (REQUIRED)`);
  parts.push(`When the planning output contains componentTree nodes with "navigateTo" fields, you MUST copy those "navigateTo" values to the corresponding DesignSpec nodes.`);
  parts.push(`For each planning component with navigateTo: find the matching node in your DesignSpec output and set its navigateTo to the same target page ID.`);
  parts.push(`\n## NavigationBar Flattening Example

Planning output:
{
  "name": "NavigationBar",
  "children": [
    { "name": "HomeTab", "navigateTo": "dashboard" },
    { "name": "ExpensesTab", "navigateTo": "add-expense" },
    { "name": "InsightsTab", "navigateTo": "spending-insights" }
  ]
}

Required DesignSpec output:
{
  "navigation-bar": { "parent": "root", "order": 0, "catalog": "navigation-bar" },
  "home-tab": { "parent": "navigation-bar", "order": 0, "catalog": "tab", "label": "Home", "navigateTo": "dashboard" },
  "expenses-tab": { "parent": "navigation-bar", "order": 1, "catalog": "tab", "label": "Expenses", "navigateTo": "add-expense" },
  "insights-tab": { "parent": "navigation-bar", "order": 2, "catalog": "tab", "label": "Insights", "navigateTo": "spending-insights" }
}

CRITICAL: Each child becomes its own node with navigateTo copied exactly.
DO NOT flatten NavigationBar into a single node with overrides.`);

  if (state.chromePass?.mode === 'consume' && state.chromePass.spec && state.chromePass.activePageId) {
    const ids = Object.keys(state.chromePass.spec.nodes).sort().join(', ');
    parts.push(
      `\n## Frozen shared chrome (required node ids)\n` +
      `Include these exact node ids for the shared chrome (add new node ids only for page content): ${ids}.\n` +
      `Current page id: ${state.chromePass.activePageId}. One tab will be marked active in post-processing.`,
    );
  }

  if (state.planning) {
    parts.push(`\nPlanning Output:\n${JSON.stringify(state.planning, null, 2)}`);
  }

  if (state.pageContext) {
    parts.push(formatPageContextPrompt(state.pageContext));
  }

  return parts.join('\n');
}

// ── Main function ──

/**
 * Generate a DesignSpec v2 via LLM tool call.
 * Superset of callClaudeDesignAPI — adds Chrome Pass, screen_type, viewport, navigateTo.
 */
export async function browserDesignWork(
  state: DesignPhaseState,
  ctx: NodeContext,
): Promise<Result<Partial<DesignPhaseState>, PipelineStageError>> {
  // Build system prompt
  let rawPrompt = loadDesignSystemPrompt();
  if (state.designTokensSpec) {
    rawPrompt = buildPromptFromTokens(rawPrompt, state.designTokensSpec);
  }
  const renderableIds = state.catalogMap
    ? Object.keys(state.catalogMap).sort().map(id => `\`${id}\``).join(', ')
    : '(none)';
  const systemPrompt = rawPrompt
    .replace('{{DESIGN_SYSTEM}}', state.designSystemPrompt || '(No project design system provided — use generic token names)')
    .replace('{{COMPONENT_CATALOG}}', state.componentCatalogPrompt || '(No component catalog available)')
    .replace('{{RENDERABLE_CATALOG_IDS}}', renderableIds);

  let userMessage = buildBrowserDesignUserMessage(state);
  const model = ctx.agentContext.resolvedModel ?? 'claude-sonnet-4-6';
  const maxTokens = 32000;

  let totalCostUsd = 0;
  let totalDurationMs = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let retry = 0; retry <= MAX_EMPTY_NODES_RETRIES; retry++) {
    const attemptStart = Date.now();

    const result = await ctx.provider.complete(
      {
        system: systemPrompt,
        messages: [{ role: 'user' as const, content: userMessage }],
        tools: [SUBMIT_DESIGN_TOOL as { name: string; description: string; parameters: Record<string, unknown> }],
      },
      {
        model,
        maxTokens,
        temperature: 0,
        toolChoice: { type: 'tool', name: 'submit_design' },
      },
    );

    const attemptDuration = Date.now() - attemptStart;

    if (!result.ok) {
      const error = result.error as unknown as { code?: string; message?: string };
      return Err(pipelineStageError('design',
        `LLM completion failed (${error.code ?? 'unknown'}): ${error.message ?? 'no detail'}`));
    }

    const completion = result.value as {
      content: string;
      toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>;
      usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
      cost: { totalCostUsd: number; inputCostUsd: number; outputCostUsd: number };
      finishReason: string;
      latencyMs?: number;
    };

    totalCostUsd += completion.cost.totalCostUsd;
    totalDurationMs += attemptDuration;
    totalInputTokens += completion.usage.inputTokens;
    totalOutputTokens += completion.usage.outputTokens;

    debugLog(
      `browserDesignWork: attempt ${retry + 1} — ` +
      `model=${model}, finishReason=${completion.finishReason}, ` +
      `outputTokens=${completion.usage.outputTokens}/${maxTokens}, ` +
      `cost=$${completion.cost.totalCostUsd.toFixed(4)}`,
    );

    ctx.telemetry?.onLlmCall('design', {
      model,
      promptTokens: totalInputTokens,
      completionTokens: totalOutputTokens,
      costUsd: totalCostUsd,
      latencyMs: totalDurationMs,
    });

    if (completion.finishReason === 'max_tokens') {
      return Err(pipelineStageError('design',
        `LLM response truncated (finishReason: max_tokens, outputTokens: ${completion.usage.outputTokens}/${maxTokens}).`));
    }

    const extractResult = extractDesignSpecFromToolCall(completion);
    if (!extractResult.ok) {
      return Err(pipelineStageError('design',
        `Failed to extract DesignSpec from tool call: ${(extractResult.error as { message?: string }).message ?? 'unknown'}`));
    }

    const spec = extractResult.value;
    const nodeCount = Object.keys(spec.nodes).length;

    if (nodeCount === 0) {
      if (retry < MAX_EMPTY_NODES_RETRIES) {
        debugLog(`browserDesignWork: empty nodes on attempt ${retry + 1}, retrying with reinforced prompt`);
        userMessage =
          `Generate a DesignSpec v2 JSON for this page. Use the submit_design tool to provide the complete specification.\n\n` +
          `CRITICAL: Your previous attempt returned an empty 'nodes' object. You MUST include a non-empty 'nodes' object. ` +
          `Every page requires a complete node tree — one root node (parent: null) and all child UI elements.\n\n` +
          buildBrowserDesignUserMessage(state);
        continue;
      }
      return Err(pipelineStageError('design',
        `LLM returned design spec with no nodes after ${retry + 1} attempt(s).`));
    }

    const finalSpec = state.chromePass?.mode === 'generate'
      ? { ...spec, screen: '__chrome__' }
      : spec;

    return Ok({
      design: {
        spec: finalSpec as unknown as Record<string, unknown>,
        designToolMetadata: { tool: 'browser' as const },
      },
    });
  }

  return Err(pipelineStageError('design', 'Design generation exhausted all retry attempts.'));
}
