/**
 * @module @agentforge/agents-design/wireframe-generator
 *
 * Wireframe Generator agent: translates UX research into a concrete
 * wireframe design spec and writes it to the design surface.
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

/** Input for the wireframe generator agent. */
export interface WireframeGeneratorInput {
  readonly pageId: string;
  readonly taskId: string;
  readonly layoutSuggestions: readonly string[];
}

/** Output produced by the wireframe generator agent. */
export interface WireframeGeneratorOutput {
  readonly designRef: string;
  readonly sectionsCreated: number;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the wireframe generator. */
export const WIREFRAME_GENERATOR_CONTRACT: AgentContract = {
  role: 'wireframe_generator',
  description: 'Generates wireframe designs from UX research layout suggestions',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 50000 },
  tools: ['figma.generate_figma_design'],
  permissions: ['read_design', 'write_design'],
  denied: [],
  hitl_policy: 'full_approval',
  budget: { max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 },
  on_complete: 'WireframeComplete',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'wireframe-generator-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Work function factory
// ============================================================================

/** Parse the LLM output as a wireframe spec. */
const parseWireframeOutput = (output: string): Result<{ name: string; html: string; sections: unknown[] }> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      name: (parsed.name as string) ?? 'Untitled Wireframe',
      html: (parsed.html as string) ?? '',
      sections: (parsed.sections as unknown[]) ?? [],
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse wireframe output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

/**
 * Create the wireframe generator's work function with a DesignSurface dependency.
 */
export const createWireframeGeneratorWork = (
  designSurface: DesignSurface,
): AgentWorkFn<WireframeGeneratorInput, WireframeGeneratorOutput> => async (
  input,
  provider,
  learnings,
  context,
) => {
  const { pageId, layoutSuggestions } = input;

  // 1. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessage = [
    `Page ID: ${pageId}`,
    `\nLayout suggestions from UX research:\n${layoutSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    learnings.length > 0 ? `\nLearnings from previous runs:\n${JSON.stringify(learnings)}` : '',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 2. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? WIREFRAME_GENERATOR_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 3. Parse output
  const parseResult = parseWireframeOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult as Result<never>;
  }

  const wireframe = parseResult.value;

  // 4. Lock design surface, write, unlock
  const lockResult = designSurface.lockForAgent(WIREFRAME_GENERATOR_CONTRACT.role);
  if (!lockResult.ok) {
    return Err(lockResult.error);
  }

  const spec: DesignSpec = {
    pageId,
    name: wireframe.name,
    html: wireframe.html,
  };

  const writeResult = await designSurface.writeDesign(spec);
  designSurface.unlockForAgent(WIREFRAME_GENERATOR_CONTRACT.role);

  if (!writeResult.ok) {
    return Err(writeResult.error);
  }

  const designRef = `designs/${pageId}/wireframe`;
  return Ok({ designRef, sectionsCreated: wireframe.sections.length });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the wireframe generator agent through the full governance pipeline.
 */
export const executeWireframeGenerator = async (
  contract: AgentContract,
  context: AgentContext,
  input: WireframeGeneratorInput,
  designSurface: DesignSurface,
): Promise<Result<unknown>> => {
  const workFn = createWireframeGeneratorWork(designSurface);
  return runAgent(
    contract,
    context,
    input,
    'write_design',
    `page:${input.pageId}`,
    `Generate wireframe for page ${input.pageId}`,
    workFn,
  );
};

/**
 * Register the wireframe generator to respond to UXResearchComplete events.
 */
export const registerWireframeGenerator = (
  eventBus: EventBus,
  context: AgentContext,
  designSurface: DesignSurface,
  contract: AgentContract = WIREFRAME_GENERATOR_CONTRACT,
): void => {
  eventBus.subscribe('UXResearchComplete', (event) => {
    const input: WireframeGeneratorInput = {
      pageId: event.pageId,
      taskId: event.taskId,
      layoutSuggestions: event.layoutSuggestions,
    };
    void executeWireframeGenerator(contract, context, input, designSurface);
  });
};
