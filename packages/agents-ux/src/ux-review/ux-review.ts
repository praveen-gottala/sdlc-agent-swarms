/**
 * @module @agentforge/agents-ux/ux-review
 *
 * UX Dashboard Review agent: runs parallel accessibility, design-system
 * compliance, and visual fidelity evaluations on implementation drafts,
 * then synthesizes results into a structured review report.
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
  DesignTokensSpec,
} from '@agentforge/core';
import {
  Ok,
  runAgent,
  loadDesignTokens,
  safeParse,
} from '@agentforge/core';
import { z } from 'zod';
import { UXReviewOutputSchema, ReviewIssueSchema } from '../schemas.js';
import type { ReviewIssue } from '../types.js';
import { diskDesignTokensRequiredErr, diskDesignTokensRequiredMessage } from '../disk-design-tokens-required.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard review agent. */
export interface UXReviewInput {
  readonly taskId: string;
  readonly branch: string;
  readonly componentPaths: readonly string[];
  readonly moduleId: string;
}

/** Output produced by the UX dashboard review agent. */
export interface UXReviewOutput {
  readonly reviewId: string;
  readonly issues: readonly ReviewIssue[];
  readonly passedAccessibility: boolean;
  readonly passedDesignSystem: boolean;
  readonly passedVisualFidelity: boolean;
  readonly overallPassed: boolean;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the UX dashboard review agent. */
export const UX_REVIEW_CONTRACT: AgentContract = {
  role: 'ux_review',
  description: 'Runs parallel accessibility, design-system compliance, and visual fidelity evaluations',
  category: 'design',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: ['playwright:snapshot', 'playwright:screenshot'],
  permissions: ['read_spec', 'read_design', 'read_code', 'read_design_system'],
  denied: ['write_code', 'write_design', 'create_branch', 'merge_pr'],
  hitl_policy: 'notify_only',
  budget: { max_tokens_per_task: 40000, max_cost_per_task_usd: 1.5 },
  on_complete: 'UXReviewCompleted',
  on_error: 'retry(max=2) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-review-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard review JSON object. */
export const parseReviewOutput = (output: string): Result<UXReviewOutput> => {
  const parseResult = safeParse(output, UXReviewOutputSchema, 'UX Review');
  if (!parseResult.ok) return parseResult;

  const val = parseResult.value as { reviewId: string; issues: ReviewIssue[] };
  const { reviewId, issues } = val;

  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  const sortedIssues = [...issues].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
  );

  const hasCriticalIn = (category: string): boolean =>
    sortedIssues.some((i) => i.category === category && i.severity === 'critical');

  const passedAccessibility = !hasCriticalIn('accessibility');
  const passedDesignSystem = !hasCriticalIn('design_system');
  const passedVisualFidelity = !hasCriticalIn('visual_fidelity');

  return Ok({
    reviewId,
    issues: sortedIssues,
    passedAccessibility,
    passedDesignSystem,
    passedVisualFidelity,
    overallPassed: passedAccessibility && passedDesignSystem && passedVisualFidelity,
  });
};

// ============================================================================
// MCP helper functions (private)
// ============================================================================

interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

const parseIssuesFromResponse = (content: string): readonly ReviewIssue[] => {
  const result = safeParse(content, z.array(ReviewIssueSchema), 'Review Issues');
  return result.ok ? result.value : [];
};

const checkAccessibility = async (
  context: AgentContext,
  provider: LLMProvider,
  componentPaths: readonly string[],
  systemPrompt: string,
  model: string,
): Promise<readonly ReviewIssue[]> => {
  try {
    const toolResult = await context.mcpClient.callTool('playwright', 'snapshot', { componentPaths });
    if (!toolResult.ok) return [];

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate accessibility for these components.\n\nPlaywright snapshot:\n${JSON.stringify(toolResult.value)}\n\nReturn a JSON array of ReviewIssue objects with category "accessibility".` }],
    };
    const result = await provider.complete(prompt, { model, maxTokens: 4000, temperature: 0 });
    if (!result.ok) return [];

    return parseIssuesFromResponse((result.value as { content: string }).content);
  } catch {
    return [];
  }
};

/**
 * Design-system compliance using loaded disk tokens (caller must validate file present).
 */
const checkDesignSystemCompliance = async (
  provider: LLMProvider,
  designTokens: DesignTokensSpec,
  componentPaths: readonly string[],
  systemPrompt: string,
  model: string,
): Promise<readonly ReviewIssue[]> => {
  try {
    const dataSource = 'Design tokens (from project spec — design-tokens.yaml)';
    const designData = designTokens;

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate design system compliance for these components.\n\nComponents: ${componentPaths.join(', ')}\n\n${dataSource}:\n${JSON.stringify(designData)}\n\nReturn a JSON array of ReviewIssue objects with category "design_system".` }],
    };
    const result = await provider.complete(prompt, { model, maxTokens: 4000, temperature: 0 });
    if (!result.ok) return [];

    return parseIssuesFromResponse((result.value as { content: string }).content);
  } catch {
    return [];
  }
};

const checkVisualFidelity = async (
  context: AgentContext,
  provider: LLMProvider,
  componentPaths: readonly string[],
  systemPrompt: string,
  model: string,
): Promise<readonly ReviewIssue[]> => {
  try {
    const toolResult = await context.mcpClient.callTool('playwright', 'screenshot', { componentPaths });
    if (!toolResult.ok) return [];

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate visual fidelity for these components.\n\nPlaywright screenshot data:\n${JSON.stringify(toolResult.value)}\n\nReturn a JSON array of ReviewIssue objects with category "visual_fidelity".` }],
    };
    const result = await provider.complete(prompt, { model, maxTokens: 4000, temperature: 0 });
    if (!result.ok) return [];

    return parseIssuesFromResponse((result.value as { content: string }).content);
  } catch {
    return [];
  }
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The UX dashboard review agent's work function.
 * Called by runAgent after governance clears.
 */
export const uxReviewWork: AgentWorkFn<UXReviewInput, UXReviewOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, componentPaths } = input;

  const diskTokens = loadDesignTokens(context.projectRoot, context.fs);
  if (!diskTokens.ok) {
    // eslint-disable-next-line no-console
    console.error(diskDesignTokensRequiredMessage(context.projectRoot));
    return diskDesignTokensRequiredErr(context.projectRoot);
  }

  const systemPrompt = loadSystemPrompt();

  const effectiveModel = context.resolvedModel ?? UX_REVIEW_CONTRACT.provider;

  const [accessibilityIssues, designSystemIssues, visualFidelityIssues] = await Promise.all([
    checkAccessibility(context, provider as unknown as LLMProvider, componentPaths, systemPrompt, effectiveModel),
    checkDesignSystemCompliance(provider as unknown as LLMProvider, diskTokens.value, componentPaths, systemPrompt, effectiveModel),
    checkVisualFidelity(context, provider as unknown as LLMProvider, componentPaths, systemPrompt, effectiveModel),
  ]);

  // 4. Merge and sort issues by severity
  const allIssues: ReviewIssue[] = [
    ...accessibilityIssues,
    ...designSystemIssues,
    ...visualFidelityIssues,
  ];

  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2 };
  allIssues.sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
  );

  // 5. Compute pass flags (category passes if no critical issues in that category)
  const hasCriticalIn = (category: string): boolean =>
    allIssues.some((i) => i.category === category && i.severity === 'critical');

  const passedAccessibility = !hasCriticalIn('accessibility');
  const passedDesignSystem = !hasCriticalIn('design_system');
  const passedVisualFidelity = !hasCriticalIn('visual_fidelity');

  // 6. Build output
  const reviewId = `review-${moduleId}-${Date.now()}`;

  return Ok({
    reviewId,
    issues: allIssues,
    passedAccessibility,
    passedDesignSystem,
    passedVisualFidelity,
    overallPassed: passedAccessibility && passedDesignSystem && passedVisualFidelity,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the UX dashboard review agent through the full governance pipeline.
 */
export const executeUXReview = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXReviewInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard review for module: ${input.moduleId}`,
    uxReviewWork,
  );
};

/**
 * Register the UX dashboard review agent to respond to ImplementationDraftReady events.
 */
export const registerUXReview = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_REVIEW_CONTRACT,
): void => {
  eventBus.subscribe('ImplementationDraftReady', (event) => {
    const input: UXReviewInput = {
      taskId: event.taskId,
      branch: event.branch,
      componentPaths: event.componentPaths,
      moduleId: event.moduleId,
    };
    void executeUXReview(contract, context, input);
  });
};
