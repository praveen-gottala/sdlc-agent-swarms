/**
 * @module @agentforge/agents-design/design-reviewer
 *
 * Design Reviewer agent: reviews a visual design for accessibility,
 * responsiveness, and design system compliance. If passed, also
 * publishes DesignPhaseComplete to kick off the spec phase.
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
} from '@agentforge/core';
import type { DesignSurface } from '../design-surface.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the design reviewer agent. */
export interface DesignReviewerInput {
  readonly pageId: string;
  readonly taskId: string;
  readonly designRef: string;
}

/** Output produced by the design reviewer agent. */
export interface DesignReviewerOutput {
  readonly passed: boolean;
  readonly issues: readonly string[];
  readonly score: number;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the design reviewer. */
export const DESIGN_REVIEWER_CONTRACT: AgentContract = {
  role: 'design_reviewer',
  description: 'Reviews visual designs for accessibility, responsiveness, and compliance',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 30000 },
  tools: ['figma.get_code', 'figma.get_metadata'],
  permissions: ['read_design'],
  denied: ['write_design'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 1.0 },
  on_complete: 'DesignReviewComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'design-reviewer-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function factory
// ============================================================================

/** Parse the LLM output as a design review result. */
const parseReviewOutput = (output: string): Result<DesignReviewerOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      passed: (parsed.passed as boolean) ?? false,
      issues: (parsed.issues as string[]) ?? [],
      score: (parsed.score as number) ?? 0,
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse design review output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

/**
 * Create the design reviewer's work function with a DesignSurface dependency.
 */
export const createDesignReviewerWork = (
  designSurface: DesignSurface,
): AgentWorkFn<DesignReviewerInput, DesignReviewerOutput> => async (
  input,
  provider,
  learnings,
  context,
) => {
  const { pageId } = input;

  // 1. Read current design
  const designResult = await designSurface.readDesign(pageId);
  if (!designResult.ok) {
    return Err(designResult.error);
  }

  // 2. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Page ID: ${pageId}`,
    `\nDesign HTML:\n${designResult.value.html}`,
    `\nDesign metadata:\n${JSON.stringify(designResult.value.metadata, null, 2)}`,
    learnings.length > 0 ? `\nLearnings from previous runs:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: DESIGN_REVIEWER_CONTRACT.provider,
    maxTokens: 4000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 4. Parse output
  const parseResult = parseReviewOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult;
  }

  const review = parseResult.value;

  // 5. If passed, publish DesignPhaseComplete
  if (review.passed) {
    context.eventBus.publish({
      type: 'DesignPhaseComplete',
      specRef: `agentforge/spec/pages.yaml#${pageId}`,
      designRef: `designs/${pageId}/visual`,
      source: 'agent:design_reviewer',
      timestamp: Date.now(),
    });
  }

  return Ok(review);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the design reviewer agent through the full governance pipeline.
 */
export const executeDesignReviewer = async (
  contract: AgentContract,
  context: AgentContext,
  input: DesignReviewerInput,
  designSurface: DesignSurface,
): Promise<Result<unknown>> => {
  const workFn = createDesignReviewerWork(designSurface);
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `page:${input.pageId}`,
    `Review design for page ${input.pageId}`,
    workFn,
  );
};

/**
 * Register the design reviewer to respond to VisualDesignComplete events.
 */
export const registerDesignReviewer = (
  eventBus: EventBus,
  context: AgentContext,
  designSurface: DesignSurface,
  contract: AgentContract = DESIGN_REVIEWER_CONTRACT,
): void => {
  eventBus.subscribe('VisualDesignComplete', (event) => {
    const input: DesignReviewerInput = {
      pageId: event.pageId,
      taskId: event.taskId,
      designRef: event.designRef,
    };
    void executeDesignReviewer(contract, context, input, designSurface);
  });
};
