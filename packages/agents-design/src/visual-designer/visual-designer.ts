/**
 * @module @agentforge/agents-design/visual-designer
 *
 * Visual Designer agent: applies design tokens to a wireframe,
 * producing a high-fidelity visual design.
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
import type { DesignSurface, DesignSpec } from '../design-surface.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the visual designer agent. */
export interface VisualDesignerInput {
  readonly pageId: string;
  readonly taskId: string;
  readonly designRef: string;
}

/** Output produced by the visual designer agent. */
export interface VisualDesignerOutput {
  readonly designRef: string;
  readonly tokensApplied: number;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the visual designer. */
export const VISUAL_DESIGNER_CONTRACT: AgentContract = {
  role: 'visual_designer',
  description: 'Applies design tokens to wireframes producing high-fidelity visual designs',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 50000 },
  tools: ['figma.generate_figma_design', 'figma.get_code', 'figma.get_variables'],
  permissions: ['read_design', 'write_design'],
  denied: [],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'VisualDesignComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'visual-designer-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function factory
// ============================================================================

/** Parse the LLM output as a visual design spec. */
const parseVisualDesignOutput = (output: string): Result<{ name: string; html: string; appliedTokens: Record<string, unknown> }> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      name: (parsed.name as string) ?? 'Untitled Visual Design',
      html: (parsed.html as string) ?? '',
      appliedTokens: (parsed.appliedTokens as Record<string, unknown>) ?? {},
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse visual design output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

/**
 * Create the visual designer's work function with a DesignSurface dependency.
 */
export const createVisualDesignerWork = (
  designSurface: DesignSurface,
): AgentWorkFn<VisualDesignerInput, VisualDesignerOutput> => async (
  input,
  provider,
  learnings,
  context,
) => {
  const { pageId } = input;

  // 1. Read current wireframe design
  const designResult = await designSurface.readDesign(pageId);
  if (!designResult.ok) {
    return Err(designResult.error);
  }

  // 2. Get design tokens
  const tokensResult = await designSurface.getTokens();
  if (!tokensResult.ok) {
    return Err(tokensResult.error);
  }

  // 3. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Page ID: ${pageId}`,
    `\nCurrent wireframe HTML:\n${designResult.value.html}`,
    `\nDesign tokens:\n${JSON.stringify(tokensResult.value, null, 2)}`,
    learnings.length > 0 ? `\nLearnings from previous runs:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 4. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? VISUAL_DESIGNER_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 5. Parse output
  const parseResult = parseVisualDesignOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult as Result<never>;
  }

  const visual = parseResult.value;

  // 6. Write visual design to surface
  const spec: DesignSpec = {
    pageId,
    name: visual.name,
    html: visual.html,
    tokens: tokensResult.value,
  };

  const writeResult = await designSurface.writeDesign(spec);
  if (!writeResult.ok) {
    return Err(writeResult.error);
  }

  const designRef = `designs/${pageId}/visual`;
  const tokensApplied = Object.keys(visual.appliedTokens).length;
  return Ok({ designRef, tokensApplied });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the visual designer agent through the full governance pipeline.
 */
export const executeVisualDesigner = async (
  contract: AgentContract,
  context: AgentContext,
  input: VisualDesignerInput,
  designSurface: DesignSurface,
): Promise<Result<unknown>> => {
  const workFn = createVisualDesignerWork(designSurface);
  return runAgent(
    contract,
    context,
    input,
    'write_design',
    `page:${input.pageId}`,
    `Apply visual design to page ${input.pageId}`,
    workFn,
  );
};

/**
 * Register the visual designer to respond to WireframeApproved events.
 */
export const registerVisualDesigner = (
  eventBus: EventBus,
  context: AgentContext,
  designSurface: DesignSurface,
  contract: AgentContract = VISUAL_DESIGNER_CONTRACT,
): void => {
  eventBus.subscribe('WireframeApproved', (event) => {
    const input: VisualDesignerInput = {
      pageId: event.pageId,
      taskId: event.taskId,
      designRef: event.designRef,
    };
    void executeVisualDesigner(contract, context, input, designSurface);
  });
};
