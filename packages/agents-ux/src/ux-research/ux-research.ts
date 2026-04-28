/**
 * @module @agentforge/agents-ux/ux-research
 *
 * UX Dashboard Research agent: analyzes PRD requirements for a dashboard
 * module and produces structured design briefs with accessibility
 * requirements and data model dependencies.
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
  safeParse,
  parsePromptFrontmatter,
} from '@agentforge/core';
import { UXResearchOutputSchema } from '../schemas.js';
import { diskDesignTokensRequiredErr, diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';
import { formatPageContextPrompt } from '../page-context-prompt.js';
import type { DesignTokensSpec, PageContext } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard research agent. */
export interface UXResearchInput {
  readonly moduleId: string;
  readonly taskId: string;
  readonly prdRequirements: readonly string[];
  /** Full design tokens spec with semantic colors, elevation, layout, z_index. */
  readonly designTokensSpec?: DesignTokensSpec;
  /** Structured page context from pages.yaml for spec-driven design. */
  readonly pageContext?: PageContext;
}

/** Output produced by the UX dashboard research agent. */
export interface UXResearchOutput {
  readonly briefId: string;
  readonly moduleId: string;
  readonly requirementIds: readonly string[];
  readonly designConstraints: readonly string[];
  readonly referencePatterns: readonly string[];
  readonly accessibilityRequirements: readonly string[];
  readonly dataModelDependencies: readonly string[];
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard research agent. */
export const UX_RESEARCH_CONTRACT: AgentContract = {
  role: 'ux_research',
  description: 'Analyzes PRD requirements for dashboard modules and produces design briefs',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 40000 },
  tools: [],
  permissions: ['read_spec', 'read_design', 'read_design_system'],
  denied: ['write_code', 'write_design', 'create_branch'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'DesignBriefCompleted',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-research-system.md');
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version;
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard research JSON object. */
export const parseResearchOutput = (output: string): Result<UXResearchOutput> => {
  return safeParse(output, UXResearchOutputSchema, 'UX Research') as Result<UXResearchOutput>;
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard research agent's work function.
 * Called by runAgent after governance clears.
 */
export const uxResearchWork: AgentWorkFn<UXResearchInput, UXResearchOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, prdRequirements, designTokensSpec } = input;

  // ── Input validation guards ──
  if (!moduleId) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Research input missing moduleId', recoverable: false });
  }
  if (!prdRequirements || prdRequirements.length === 0) {
    return Err({ code: 'INVALID_STATE' as const, message: 'Research input missing prdRequirements — pass at least one requirement or the full PRD content', recoverable: false });
  }
  if (prdRequirements.every(r => r.length < 50)) {
    // eslint-disable-next-line no-console
    console.warn('[research] Warning: prdRequirements appear to contain only short labels, not full PRD content. Pass the full PRD text for better results.');
  }

  // 1. Read existing specs for context
  const specDir = join(context.projectRoot, 'agentforge/spec');
  const existingSpecs = readSpecs(specDir, context.fs);
  const specsContent = existingSpecs.ok ? JSON.stringify(existingSpecs.value) : '{}';

  // Extract design tokens from readSpecs result instead of re-reading from disk
  let effectiveTokensSpec = designTokensSpec;
  if (!effectiveTokensSpec) {
    const tokensFromSpecs = existingSpecs.ok ? existingSpecs.value.designTokens : undefined;
    if (!tokensFromSpecs) {
      // eslint-disable-next-line no-console
      console.error(diskDesignTokensRequiredMessage(context.projectRoot));
      return diskDesignTokensRequiredErr(context.projectRoot);
    }
    effectiveTokensSpec = tokensFromSpecs;
  }

  // 2. Build prompt with cache control on shared prefix
  const systemPrompt = loadSystemPrompt();

  // Shared context (same across all pages — cacheable)
  const sharedContext = [
    `\nExisting specs:\n${specsContent}`,
    ...(effectiveTokensSpec ? [`\nDesign Tokens (from project spec):\n${JSON.stringify(effectiveTokensSpec, null, 2)}`] : []),
    ...(learnings.length > 0 ? [`\nLearnings from previous runs:\n${JSON.stringify(learnings)}`] : []),
  ].join('\n');

  // Page-specific context (unique per page)
  const pageContext = [
    `Module ID: ${moduleId}`,
    `\nPRD Requirements:\n${prdRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    ...(input.pageContext ? [formatPageContextPrompt(input.pageContext)] : []),
  ].join('\n');

  const prompt = {
    system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
    messages: [{
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: sharedContext, cache_control: { type: 'ephemeral' as const } },
        { type: 'text' as const, text: pageContext },
      ],
    }],
  };

  // 3. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? UX_RESEARCH_CONTRACT.provider,
    maxTokens: 8000,
    temperature: 0,
    promptVersion: promptVersionCache,
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
 * Execute the UX dashboard research agent through the full governance pipeline.
 */
export const executeUXResearch = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXResearchInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard research for module: ${input.moduleId}`,
    uxResearchWork,
  );
};

/**
 * Register the UX dashboard research agent to respond to UXModuleRequested events.
 */
export const registerUXResearch = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_RESEARCH_CONTRACT,
): void => {
  eventBus.subscribe('UXModuleRequested', (event) => {
    const input: UXResearchInput = {
      moduleId: event.moduleId,
      taskId: event.taskId,
      prdRequirements: event.prdRequirements,
    };
    void executeUXResearch(contract, context, input);
  });
};
