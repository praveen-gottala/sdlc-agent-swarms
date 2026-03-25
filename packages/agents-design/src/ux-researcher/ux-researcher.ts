/**
 * @module @agentforge/agents-design/ux-researcher
 *
 * UX Researcher agent: analyzes a page description and produces
 * layout suggestions, user flows, and accessibility notes.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
} from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX researcher agent. */
export interface UXResearcherInput {
  readonly pageId: string;
  readonly taskId: string;
  readonly description: string;
}

/** Output produced by the UX researcher agent. */
export interface UXResearcherOutput {
  readonly layoutSuggestions: readonly string[];
  readonly userFlows: readonly string[];
  readonly accessibilityNotes: readonly string[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX researcher. */
export const UX_RESEARCHER_CONTRACT: AgentContract = {
  role: 'ux_researcher',
  description: 'Analyzes page descriptions and produces UX layout suggestions',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 20000 },
  tools: [],
  permissions: ['read_spec', 'read_design'],
  denied: [],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 20000, max_cost_per_task_usd: 0.5 },
  on_complete: 'UXResearchComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-researcher-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function
// ============================================================================

/** Parse the LLM output as a UX research JSON object. */
const parseResearchOutput = (output: string): Result<UXResearcherOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      layoutSuggestions: (parsed.layoutSuggestions as string[]) ?? [],
      userFlows: (parsed.userFlows as string[]) ?? [],
      accessibilityNotes: (parsed.accessibilityNotes as string[]) ?? [],
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX research output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

/**
 * The UX researcher's work function.
 * Called by runAgent after governance clears.
 */
export const uxResearcherWork: AgentWorkFn<UXResearcherInput, UXResearcherOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { description } = input;

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // 2. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Page description: ${description}`,
    `\nExisting specs:\n${specsContent}`,
    learnings.length > 0 ? `\nLearnings from previous runs:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? UX_RESEARCHER_CONTRACT.provider,
    maxTokens: 4000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 4. Parse output
  const parseResult = parseResearchOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult;
  }

  return Ok(parseResult.value);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX researcher agent through the full governance pipeline.
 */
export const executeUXResearcher = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXResearcherInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `page:${input.pageId}`,
    `UX research for page: ${input.description}`,
    uxResearcherWork,
  );
};

/**
 * Register the UX researcher to respond to PageRequested events.
 */
export const registerUXResearcher = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_RESEARCHER_CONTRACT,
): void => {
  eventBus.subscribe('PageRequested', (event) => {
    const input: UXResearcherInput = {
      pageId: event.pageId,
      taskId: event.taskId,
      description: event.description,
    };
    void executeUXResearcher(contract, context, input);
  });
};
