/**
 * @module @agentforge/agents-code/pr-reviewer
 *
 * PR Reviewer agent: reviews generated code for quality, security, and
 * architecture compliance. Uses complete mode (not streaming) and
 * claude-haiku-4 for fast, cost-effective reviews.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  TaskEntry,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readYaml,
} from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the PR reviewer agent. */
export interface PRReviewerInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly stackConfigPath: string;
  readonly promptTemplatePath: string;
  /** PR number to review. */
  readonly prNumber: number;
  /** Spec reference for the feature being reviewed. */
  readonly specRef: string;
}

/** Output produced by the PR reviewer agent. */
export interface PRReviewerOutput {
  readonly prNumber: number;
  readonly decision: 'APPROVE' | 'REQUEST_CHANGES';
  readonly reviewBody: string;
  readonly totalCostUsd: number;
}

/** Parsed review from LLM output. */
interface ParsedReview {
  readonly decision: 'APPROVE' | 'REQUEST_CHANGES';
  readonly body: string;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the PR reviewer. */
export const PR_REVIEWER_CONTRACT: AgentContract = {
  role: 'pr_reviewer',
  description: 'Reviews generated code for quality, security, architecture compliance',
  category: 'code',
  provider: 'claude-haiku-4',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 50000 },
  tools: ['github.read_pr', 'github.create_review'],
  permissions: ['read_spec', 'read_code', 'read_design'],
  denied: ['write_code', 'deploy_staging', 'deploy_production', 'merge_pr', 'write_design'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 0.5 },
  on_complete: 'ReviewComplete',
  on_error: 'notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt loading
// ============================================================================

let promptTemplateCache: string | undefined;

const loadPromptTemplate = (templatePath: string): string => {
  if (promptTemplateCache) return promptTemplateCache;
  promptTemplateCache = readFileSync(templatePath, 'utf-8');
  return promptTemplateCache;
};

let stackConfigCache: string | undefined;

const loadStackConfig = (configPath: string): string => {
  if (stackConfigCache) return stackConfigCache;
  stackConfigCache = readFileSync(configPath, 'utf-8');
  return stackConfigCache;
};

// ============================================================================
// Helpers
// ============================================================================

/** Parse the LLM review output into a structured decision. */
export const parseReviewOutput = (output: string): ParsedReview => {
  // Look for decision marker in the output
  const hasRequestChanges = /REQUEST_CHANGES/i.test(output);
  const decision = hasRequestChanges ? 'REQUEST_CHANGES' as const : 'APPROVE' as const;

  return { decision, body: output.trim() };
};

// ============================================================================
// Work function
// ============================================================================

/**
 * The PR reviewer's work function.
 * Called by runAgent after governance clears.
 * Uses provider.complete() — not streaming. Review is a single output.
 */
export const prReviewerWork: AgentWorkFn<PRReviewerInput, PRReviewerOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { task, stackConfigPath, promptTemplatePath, prNumber, specRef } = input;

  // 1. Read the PR diff via MCP
  const prResult = await context.mcpClient.callTool('github', 'read_pr', {
    pr_number: prNumber,
  });
  if (!prResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read PR #${prNumber}: ${prResult.error.message}`,
      recoverable: true,
    });
  }

  const prData = typeof prResult.value === 'string'
    ? prResult.value
    : JSON.stringify(prResult.value, null, 2);

  // 2. Read the spec that the PR implements
  const specResult = readYaml<Record<string, unknown>>(
    join(context.projectRoot, specRef),
    context.fs,
  );
  if (!specResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read spec at ${specRef}: ${specResult.error.message}`,
      recoverable: false,
    });
  }

  // 3. Load stack config and prompt template
  const stackConfig = loadStackConfig(stackConfigPath);
  const promptTemplate = loadPromptTemplate(promptTemplatePath);

  // 4. Build the system prompt
  const systemPrompt = [
    promptTemplate,
    '\n## Stack Configuration\n',
    '```yaml',
    stackConfig,
    '```',
  ].join('\n');

  // 5. Build the user message
  const userMessage = [
    `## PR #${prNumber} Diff\n\`\`\`\n${prData}\n\`\`\``,
    `\n## Spec\n\`\`\`json\n${JSON.stringify(specResult.value, null, 2)}\n\`\`\``,
    learnings.length > 0
      ? `\n## Agent Learnings\n${JSON.stringify(learnings, null, 2)}`
      : '',
    `\nReview this PR against the spec. Provide your decision (APPROVE or REQUEST_CHANGES) and detailed comments.`,
  ].join('\n');

  // 6. Call provider.complete() — not streaming
  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  const completionResult = await provider.complete(prompt, {
    model: PR_REVIEWER_CONTRACT.provider,
    maxTokens: 4000,
    temperature: 0,
  });
  if (!completionResult.ok) {
    return Err({
      code: 'LLM_API_ERROR' as const,
      message: `LLM completion failed: ${completionResult.error.message}`,
      recoverable: true,
    });
  }

  const completionValue = completionResult.value as { content: string; cost: { totalCostUsd: number } };
  const { content, cost } = completionValue;

  // 7. Parse the review output
  const review = parseReviewOutput(content);

  // 8. Post the review via MCP
  const reviewEvent = review.decision === 'APPROVE' ? 'APPROVE' : 'REQUEST_CHANGES';
  const postResult = await context.mcpClient.callTool('github', 'create_review', {
    pr_number: prNumber,
    body: review.body,
    event: reviewEvent,
  });
  if (!postResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to post review on PR #${prNumber}: ${postResult.error.message}`,
      recoverable: true,
    });
  }

  // 9. Emit ReviewComplete event
  context.eventBus.publish({
    type: 'ReviewComplete',
    taskId: task.id,
    agentId: PR_REVIEWER_CONTRACT.role,
    prNumber,
    decision: review.decision,
    timestamp: Date.now(),
  });

  return Ok({
    prNumber,
    decision: review.decision,
    reviewBody: review.body,
    totalCostUsd: cost.totalCostUsd,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the PR reviewer agent through the full governance pipeline.
 */
export const executePRReviewer = async (
  contract: AgentContract,
  context: AgentContext,
  input: PRReviewerInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'read_code',
    `PR #${input.prNumber}`,
    `Review PR #${input.prNumber} against spec ${input.specRef}`,
    prReviewerWork,
  );
};

/**
 * Register the PR reviewer to respond to PRCreated events.
 */
export const registerPRReviewer = (
  eventBus: EventBus,
  context: AgentContext,
  stackConfigPath: string,
  promptTemplatePath: string,
  contract: AgentContract = PR_REVIEWER_CONTRACT,
): void => {
  eventBus.subscribe('PRCreated', (event) => {
    void context.eventBus.publish({
      type: 'AgentStarted',
      agentId: contract.role,
      taskId: event.taskId,
      timestamp: Date.now(),
    });
  });
};
