/**
 * @module @agentforge/agents-ux/ux-dashboard-planning
 *
 * UX Dashboard Planning agent: translates design briefs into component specs
 * with token bindings, responsive rules, and 4-stage implementation sequences.
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
  loadDesignTokens,
  loadBrandSpec,
  loadComponentLibrary,
  recordPromptTrace,
} from '@agentforge/core';
import type { UXDashboardResearchOutput } from '../ux-research/ux-dashboard-research.js';
import type { ComponentTreeNode, ResponsiveRule, ImplementationStage, ScreenDefinition } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard planning agent. */
export interface UXDashboardPlanningInput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly designBrief: UXDashboardResearchOutput;
}

/** Output produced by the UX dashboard planning agent. */
export interface UXDashboardPlanningOutput {
  readonly specRef: string;
  readonly moduleId: string;
  readonly componentTree: readonly ComponentTreeNode[];
  readonly tokenBindings: Readonly<Record<string, string>>;
  readonly responsiveRules: readonly ResponsiveRule[];
  readonly implementationStages: readonly ImplementationStage[];
  /** Optional screen partitioning for per-screen design generation. */
  readonly screens?: readonly ScreenDefinition[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard planning agent. */
export const UX_DASHBOARD_PLANNING_CONTRACT: AgentContract = {
  role: 'ux_dashboard_planning',
  description: 'Translates design briefs into component specs with token bindings, responsive rules, and 4-stage implementation sequences',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 30000 },
  tools: ['figma:get_variable_defs', 'figma:get_code_connect_map'],
  permissions: ['read_spec', 'read_design', 'read_design_system', 'write_spec'],
  denied: ['write_code', 'create_branch'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 1.0 },
  on_complete: 'ComponentSpecReady',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-planning-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard planning JSON object. */
export const parsePlanningOutput = (output: string): Result<UXDashboardPlanningOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    return Ok({
      specRef: (parsed.specRef as string) ?? '',
      moduleId: (parsed.moduleId as string) ?? '',
      componentTree: (parsed.componentTree as ComponentTreeNode[]) ?? [],
      tokenBindings: (parsed.tokenBindings as Record<string, string>) ?? {},
      responsiveRules: (parsed.responsiveRules as ResponsiveRule[]) ?? [],
      implementationStages: (parsed.implementationStages as ImplementationStage[]) ?? [],
      screens: (parsed.screens as ScreenDefinition[] | undefined),
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard planning output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard planning agent's work function.
 * Called by runAgent after governance clears.
 */
export const uxDashboardPlanningWork: AgentWorkFn<UXDashboardPlanningInput, UXDashboardPlanningOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, designBrief } = input;

  // ── Input validation guards ──
  if (!moduleId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Planning input missing moduleId', recoverable: false });
  }
  if (!designBrief || !designBrief.briefId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Planning input missing designBrief — run research stage first', recoverable: false });
  }
  if (designBrief.designConstraints.length === 0 && designBrief.referencePatterns.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[planning] Warning: designBrief has no constraints or reference patterns — research output may be incomplete.');
  }

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // 2. Fetch design tokens — ADR-024: try get_variable_defs, fall back to disk tokens, then get_code
  let tokenContext = '';
  const varResult = await context.mcpClient.callTool('figma', 'get_variable_defs', { moduleId });
  if (varResult.ok) {
    tokenContext = `\nDesign Tokens (from Figma Variables API):\n${JSON.stringify(varResult.value, null, 2)}`;
  } else {
    // Fallback 1: Load design tokens from agentforge/spec/design-tokens.yaml
    const diskTokens = loadDesignTokens(context.projectRoot, context.fs);
    if (diskTokens.ok) {
      tokenContext = `\nDesign Tokens (from project spec — design-tokens.yaml):\n${JSON.stringify(diskTokens.value, null, 2)}`;
      // Also inject brand spec if available
      const diskBrand = loadBrandSpec(context.projectRoot, context.fs);
      if (diskBrand.ok) {
        tokenContext += `\n\nBrand Spec (from project spec — brand.yaml):\n${JSON.stringify(diskBrand.value, null, 2)}`;
      }
    } else {
      // Fallback 2: ADR-024 extract tokens from get_code inline styles
      const codeResult = await context.mcpClient.callTool('figma', 'get_code', { moduleId });
      if (codeResult.ok) {
        tokenContext = `\nDesign Tokens (extracted from inline styles — Variables API unavailable, see ADR-024):\n${JSON.stringify(codeResult.value, null, 2)}`;
      }
    }
  }

  // 2b. Load component library for reference in token bindings
  const componentLibResult = loadComponentLibrary(context.projectRoot, context.fs);
  let componentLibContext = '';
  if (componentLibResult.ok) {
    const lib = componentLibResult.value;
    const mappingLines = Object.entries(lib.react_mappings).map(([component, mapping]) => {
      const variantNote = mapping.variant_prop ? ` (variant prop: ${mapping.variant_prop})` : '';
      return `- ${component}: ${mapping.component_name}${variantNote}`;
    });
    componentLibContext = `\nComponent Library: ${lib.library_name}\nAvailable components:\n${mappingLines.join('\n')}\n\nUse these component names in your componentTree and tokenBindings where applicable.`;
  }

  // 3. Build prompt
  const systemPrompt = loadSystemPrompt();
  const userMessageParts = [
    `Module ID: ${moduleId}`,
    `\nDesign Brief:\n${JSON.stringify(designBrief, null, 2)}`,
    `\nExisting specs:\n${specsContent}`,
  ];

  if (tokenContext) {
    userMessageParts.push(tokenContext);
  }

  if (componentLibContext) {
    userMessageParts.push(componentLibContext);
  }

  if (learnings.length > 0) {
    userMessageParts.push(`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`);
  }

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessageParts.join('\n') }],
  };

  // 3a. Record prompt trace
  recordPromptTrace(context, 'planning', prompt, {
    model: UX_DASHBOARD_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
  });

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: UX_DASHBOARD_PLANNING_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return completionResult as Result<never>;
  }

  const llmOutput = (completionResult.value as { content: string }).content;

  // 4. Parse output
  const parseResult = parsePlanningOutput(llmOutput);
  if (!parseResult.ok) {
    return parseResult;
  }

  return Ok(parseResult.value);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard planning agent through the full governance pipeline.
 */
export const executeUXDashboardPlanning = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardPlanningInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard planning for module: ${input.moduleId}`,
    uxDashboardPlanningWork,
  );
};

/**
 * Register the UX dashboard planning agent to respond to DesignBriefCompleted events.
 */
export const registerUXDashboardPlanning = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_PLANNING_CONTRACT,
): void => {
  eventBus.subscribe('DesignBriefCompleted', (event) => {
    const input: UXDashboardPlanningInput = {
      briefId: event.briefId,
      moduleId: event.moduleId,
      taskId: event.taskId,
      designBrief: event as unknown as UXDashboardResearchOutput,
    };
    void executeUXDashboardPlanning(contract, context, input);
  });
};
