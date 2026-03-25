/**
 * @module @agentforge/agents-code/pr-reviewer
 *
 * PR Reviewer agent: reviews generated code for quality, security, and
 * architecture compliance. Uses complete mode (not streaming) and
 * claude-haiku-4-5 for fast, cost-effective reviews.
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
  AgentLearning,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readYaml,
  readLearnings,
  addObservation,
  updateObservationConfidence,
  expireObservation,
  formatLearningsForPrompt,
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
  provider: 'claude-haiku-4-5',
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
// Learnings integration
// ============================================================================

/**
 * Extract feedback themes from a REQUEST_CHANGES review body.
 * Returns a list of concise feedback strings suitable for observations.
 */
export const extractFeedbackThemes = (reviewBody: string): string[] => {
  const themes: string[] = [];
  // Look for markdown list items with issues/fixes
  const issuePattern = /\*\*Issue\*\*:\s*(.+)/gi;
  let match: RegExpExecArray | null;
  while ((match = issuePattern.exec(reviewBody)) !== null) {
    themes.push(match[1].trim());
  }
  // Fallback: if no structured issues, extract sentences containing "should", "must", "missing"
  if (themes.length === 0) {
    const sentences = reviewBody.split(/[.!?\n]/).filter((s) => s.trim().length > 10);
    for (const sentence of sentences) {
      if (/\b(should|must|missing|required|forbidden|avoid)\b/i.test(sentence)) {
        themes.push(sentence.trim());
      }
    }
  }
  return themes;
};

/**
 * Create observations from human feedback (changes_requested).
 * Each feedback theme becomes a high-confidence observation.
 */
export const createObservationsFromFeedback = async (
  role: string,
  taskId: string,
  feedbackThemes: string[],
  learningsPath: string,
): Promise<void> => {
  for (const theme of feedbackThemes) {
    await addObservation(role, {
      date: new Date().toISOString(),
      source: `human_feedback_on_${taskId}`,
      learning: theme,
      confidence: 'high',
      taskRef: taskId,
      active: true,
    }, learningsPath);
  }
};

/**
 * Check if a feedback theme contradicts an existing learning.
 * Simple heuristic: if the new feedback directly opposes an existing learning
 * (e.g., "use named exports" vs "use default exports"), expire the old one.
 */
export const handleContradictions = async (
  role: string,
  feedbackThemes: string[],
  existingLearnings: AgentLearning[],
  learningsPath: string,
): Promise<void> => {
  // Build a simple contradiction map: keywords that oppose each other
  const opposites: ReadonlyArray<readonly [RegExp, RegExp]> = [
    [/named exports/i, /default exports/i],
    [/default exports/i, /named exports/i],
    [/camelCase/i, /snake_case/i],
    [/snake_case/i, /camelCase/i],
    [/class components/i, /functional components/i],
    [/functional components/i, /class components/i],
  ];

  for (const theme of feedbackThemes) {
    for (const [feedbackPattern, learningPattern] of opposites) {
      if (feedbackPattern.test(theme)) {
        for (const existing of existingLearnings) {
          if (learningPattern.test(existing.learning) && existing.active) {
            await expireObservation(role, existing.id, learningsPath);
          }
        }
      }
    }
  }
};

/**
 * Check for recurring patterns across learnings.
 * If the same feedback appears 3+ times (from different tasks),
 * promote the first occurrence from "medium" to "high" confidence.
 */
export const promoteRecurringPatterns = async (
  role: string,
  learningsPath: string,
): Promise<void> => {
  const result = await readLearnings(role, learningsPath);
  if (!result.ok) return;

  const observations = result.value.filter((obs) => obs.active);

  // Group by normalized learning text
  const grouped = new Map<string, AgentLearning[]>();
  for (const obs of observations) {
    const key = obs.learning.toLowerCase().trim();
    const group = grouped.get(key) ?? [];
    group.push(obs);
    grouped.set(key, group);
  }

  // Promote patterns seen 3+ times from different tasks
  for (const [, group] of grouped) {
    const uniqueTasks = new Set(group.map((obs) => obs.taskRef).filter(Boolean));
    if (uniqueTasks.size >= 3) {
      // Promote any medium-confidence observations in this group to high
      for (const obs of group) {
        if (obs.confidence === 'medium') {
          await updateObservationConfidence(role, obs.id, 'high', learningsPath);
        }
      }
    }
  }
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

  // 4. Build the system prompt (with Team Conventions from learnings)
  const typedLearnings = learnings as AgentLearning[];
  const conventionsSection = formatLearningsForPrompt(typedLearnings);
  const systemPrompt = [
    promptTemplate,
    '\n## Stack Configuration\n',
    '```yaml',
    stackConfig,
    '```',
    conventionsSection,
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
    model: context.resolvedModel ?? PR_REVIEWER_CONTRACT.provider,
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
    source: `agent:${PR_REVIEWER_CONTRACT.role}`,
    timestamp: Date.now(),
  });

  // 10. Post-review learnings: create observations from feedback
  const lPath = join(context.projectRoot, '.agentforge/learnings');
  if (review.decision === 'REQUEST_CHANGES') {
    const themes = extractFeedbackThemes(review.body);
    if (themes.length > 0) {
      // Create high-confidence observations from the review feedback
      await createObservationsFromFeedback(PR_REVIEWER_CONTRACT.role, task.id, themes, lPath);
      // Handle contradictions against existing learnings
      await handleContradictions(PR_REVIEWER_CONTRACT.role, themes, typedLearnings, lPath);
    }
  }

  // 11. Promote recurring patterns (3+ from different tasks → high confidence)
  await promoteRecurringPatterns(PR_REVIEWER_CONTRACT.role, lPath);

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
      source: `agent:${contract.role}`,
      timestamp: Date.now(),
    });
  });
};
