/**
 * @module @agentforge/agents-ux/ux-dashboard-implementation
 *
 * UX Dashboard Implementation agent: generates React 19 + Tailwind CSS code
 * from component specs produced by the planning agent. Uses streaming mode.
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
  CostRecord,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readSpecs,
} from '@agentforge/core';
import type { UXDashboardPlanningOutput } from '../ux-planning/ux-dashboard-planning.js';
import type { ImplementationStage } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard implementation agent. */
export interface UXDashboardImplementationInput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly componentSpec: UXDashboardPlanningOutput;
  readonly stage: ImplementationStage['stage'];
}

/** A single generated file with path and content. */
export interface GeneratedFile {
  readonly filePath: string;
  readonly content: string;
}

/** Output produced by the UX dashboard implementation agent. */
export interface UXDashboardImplementationOutput {
  readonly moduleId: string;
  readonly stage: ImplementationStage['stage'];
  readonly files: readonly GeneratedFile[];
  readonly totalCostUsd: number;
}

// ============================================================================
// Stream helpers (local — agents-ux does not depend on @agentforge/providers)
// ============================================================================

/** Minimal stream chunk shape matching the provider contract. */
interface StreamChunk {
  readonly type: 'token' | 'done';
  readonly content?: string;
  readonly cost?: CostRecord;
}

/** Collect all chunks from a provider stream into a single string + cost. */
const collectStreamOutput = async (
  stream: AsyncIterable<unknown>,
): Promise<Result<{ content: string; cost: CostRecord }>> => {
  let content = '';
  let finalCost: CostRecord | undefined;

  for await (const rawChunk of stream) {
    const chunk = rawChunk as StreamChunk;
    if (chunk.type === 'token') {
      content += chunk.content ?? '';
    } else if (chunk.type === 'done') {
      finalCost = chunk.cost;
    }
  }

  if (!finalCost) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: 'Stream ended without a done chunk containing cost data',
      recoverable: true,
    });
  }

  return Ok({ content, cost: finalCost });
};

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard implementation agent. */
export const UX_DASHBOARD_IMPLEMENTATION_CONTRACT: AgentContract = {
  role: 'ux_dashboard_implementation',
  description: 'Generates React 19 + Tailwind CSS code from component specs with design token bindings',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 60000 },
  tools: ['figma:get_code_connect_map', 'github.create_branch', 'github.push_files'],
  permissions: ['read_spec', 'read_design', 'read_design_system', 'write_code', 'create_branch'],
  denied: ['deploy_staging', 'deploy_production', 'merge_pr'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 60000, max_cost_per_task_usd: 2.0 },
  on_complete: 'ImplementationDraftReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-implementation-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard implementation JSON object. */
export const parseImplementationOutput = (output: string): Result<UXDashboardImplementationOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      moduleId: (parsed.moduleId as string) ?? '',
      stage: (parsed.stage as ImplementationStage['stage']) ?? 'layout',
      files: (parsed.files as GeneratedFile[]) ?? [],
      totalCostUsd: (parsed.totalCostUsd as number) ?? 0,
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard implementation output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard implementation agent's work function.
 * Called by runAgent after governance clears. Uses streaming mode.
 */
export const uxDashboardImplementationWork: AgentWorkFn<UXDashboardImplementationInput, UXDashboardImplementationOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, componentSpec, stage } = input;

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // 2. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `Implementation Stage: ${stage}`,
    `\nComponent Spec:\n${JSON.stringify(componentSpec, null, 2)}`,
    `\nExisting specs:\n${specsContent}`,
  ];

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  // 3. Call LLM via streaming
  const stream = provider.stream(prompt, {
    model: UX_DASHBOARD_IMPLEMENTATION_CONTRACT.provider,
    maxTokens: 16000,
    temperature: 0,
  });

  const collectResult = await collectStreamOutput(stream);
  if (!collectResult.ok) {
    return collectResult as Result<never>;
  }

  // 4. Parse output
  const parseResult = parseImplementationOutput(collectResult.value.content);
  if (!parseResult.ok) {
    return parseResult;
  }

  // Attach actual cost from stream
  const result: UXDashboardImplementationOutput = {
    ...parseResult.value,
    totalCostUsd: collectResult.value.cost.totalCostUsd,
  };

  return Ok(result);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard implementation agent through the full governance pipeline.
 */
export const executeUXDashboardImplementation = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardImplementationInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_code',
    `module:${input.moduleId}`,
    `UX dashboard implementation (${input.stage}) for module: ${input.moduleId}`,
    uxDashboardImplementationWork,
  );
};

/**
 * Register the UX dashboard implementation agent to respond to FigmaDesignReady events.
 * Uses the Figma-native workflow instead of the old wireframe preview HITL gate.
 */
export const registerUXDashboardImplementation = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_IMPLEMENTATION_CONTRACT,
): void => {
  eventBus.subscribe('FigmaDesignReady', (event) => {
    const input: UXDashboardImplementationInput = {
      specRef: `figma://${event.figmaFileId}/${event.figmaPageId}`,
      moduleId: event.moduleId,
      taskId: event.taskId,
      componentSpec: event as unknown as UXDashboardPlanningOutput,
      stage: 'layout',
    };
    void executeUXDashboardImplementation(contract, context, input);
  });
};
