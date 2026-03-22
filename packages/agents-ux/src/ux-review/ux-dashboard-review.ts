/**
 * @module @agentforge/agents-ux/ux-dashboard-review
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
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
} from '@agentforge/core';
import type { ReviewIssue } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the UX dashboard review agent. */
export interface UXDashboardReviewInput {
  readonly taskId: string;
  readonly branch: string;
  readonly componentPaths: readonly string[];
  readonly moduleId: string;
}

/** Output produced by the UX dashboard review agent. */
export interface UXDashboardReviewOutput {
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
export const UX_DASHBOARD_REVIEW_CONTRACT: AgentContract = {
  role: 'ux_dashboard_review',
  description: 'Runs parallel accessibility, design-system compliance, and visual fidelity evaluations',
  category: 'design',
  provider: 'claude-sonnet-4',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 40000 },
  tools: ['playwright:snapshot', 'playwright:screenshot', 'figma:get_variable_defs'],
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
  const promptPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts', 'ux-dashboard-review-system.md');
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Output parser
// ============================================================================

/** Parse the LLM output as a UX dashboard review JSON object. */
export const parseReviewOutput = (output: string): Result<UXDashboardReviewOutput> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : output.trim();

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const issues = (parsed.issues as ReviewIssue[]) ?? [];

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
      reviewId: (parsed.reviewId as string) ?? '',
      issues: sortedIssues,
      passedAccessibility,
      passedDesignSystem,
      passedVisualFidelity,
      overallPassed: passedAccessibility && passedDesignSystem && passedVisualFidelity,
    });
  } catch {
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: `Failed to parse UX dashboard review output: ${jsonStr.slice(0, 200)}`,
      recoverable: true,
    });
  }
};

// ============================================================================
// MCP helper functions (private)
// ============================================================================

interface LLMProvider {
  complete: (prompt: { system: string; messages: { role: 'user'; content: string }[] }, opts: { model: string; maxTokens: number; temperature: number }) => Promise<Result<{ content: string }>>;
}

const parseIssuesFromResponse = (content: string): readonly ReviewIssue[] => {
  try {
    const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(content);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.trim();
    const parsed = JSON.parse(jsonStr) as ReviewIssue[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const checkAccessibility = async (
  context: AgentContext,
  provider: LLMProvider,
  componentPaths: readonly string[],
  systemPrompt: string,
): Promise<readonly ReviewIssue[]> => {
  try {
    const toolResult = await context.mcpClient.callTool('playwright', 'snapshot', { componentPaths });
    if (!toolResult.ok) return [];

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate accessibility for these components.\n\nPlaywright snapshot:\n${JSON.stringify(toolResult.value)}\n\nReturn a JSON array of ReviewIssue objects with category "accessibility".` }],
    };
    const result = await provider.complete(prompt, { model: UX_DASHBOARD_REVIEW_CONTRACT.provider, maxTokens: 4000, temperature: 0 });
    if (!result.ok) return [];

    return parseIssuesFromResponse((result.value as { content: string }).content);
  } catch {
    return [];
  }
};

/**
 * ADR-024: Attempts get_variable_defs first (Enterprise Figma). On failure,
 * falls back to get_code which includes inline style data with token references.
 */
const checkDesignSystemCompliance = async (
  context: AgentContext,
  provider: LLMProvider,
  componentPaths: readonly string[],
  systemPrompt: string,
): Promise<readonly ReviewIssue[]> => {
  try {
    // Primary: Figma Variables API (Enterprise only — ADR-024)
    let designData: unknown;
    let dataSource: string;

    const varResult = await context.mcpClient.callTool('figma', 'get_variable_defs', { componentPaths });
    if (varResult.ok) {
      designData = varResult.value;
      dataSource = 'Figma variable definitions';
    } else {
      // ADR-024 fallback: extract design tokens from get_code inline styles
      const codeResult = await context.mcpClient.callTool('figma', 'get_code', { componentPaths });
      if (!codeResult.ok) return [];
      designData = codeResult.value;
      dataSource = 'Figma code/inline styles (Variables API unavailable — ADR-024)';
    }

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate design system compliance for these components.\n\n${dataSource}:\n${JSON.stringify(designData)}\n\nReturn a JSON array of ReviewIssue objects with category "design_system".` }],
    };
    const result = await provider.complete(prompt, { model: UX_DASHBOARD_REVIEW_CONTRACT.provider, maxTokens: 4000, temperature: 0 });
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
): Promise<readonly ReviewIssue[]> => {
  try {
    const toolResult = await context.mcpClient.callTool('playwright', 'screenshot', { componentPaths });
    if (!toolResult.ok) return [];

    const prompt = {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: `Evaluate visual fidelity for these components.\n\nPlaywright screenshot data:\n${JSON.stringify(toolResult.value)}\n\nReturn a JSON array of ReviewIssue objects with category "visual_fidelity".` }],
    };
    const result = await provider.complete(prompt, { model: UX_DASHBOARD_REVIEW_CONTRACT.provider, maxTokens: 4000, temperature: 0 });
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
export const uxDashboardReviewWork: AgentWorkFn<UXDashboardReviewInput, UXDashboardReviewOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { moduleId, componentPaths } = input;

  // 1. Load system prompt
  const systemPrompt = loadSystemPrompt();

  // 3. Run all 3 evaluations in parallel
  const [accessibilityIssues, designSystemIssues, visualFidelityIssues] = await Promise.all([
    checkAccessibility(context, provider as unknown as LLMProvider, componentPaths, systemPrompt),
    checkDesignSystemCompliance(context, provider as unknown as LLMProvider, componentPaths, systemPrompt),
    checkVisualFidelity(context, provider as unknown as LLMProvider, componentPaths, systemPrompt),
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
export const executeUXDashboardReview = async (
  contract: AgentContract,
  context: AgentContext,
  input: UXDashboardReviewInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_design',
    `module:${input.moduleId}`,
    `UX dashboard review for module: ${input.moduleId}`,
    uxDashboardReviewWork,
  );
};

/**
 * Register the UX dashboard review agent to respond to ImplementationDraftReady events.
 */
export const registerUXDashboardReview = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = UX_DASHBOARD_REVIEW_CONTRACT,
): void => {
  eventBus.subscribe('ImplementationDraftReady', (event) => {
    const input: UXDashboardReviewInput = {
      taskId: event.taskId,
      branch: event.branch,
      componentPaths: event.componentPaths,
      moduleId: event.moduleId,
    };
    void executeUXDashboardReview(contract, context, input);
  });
};
