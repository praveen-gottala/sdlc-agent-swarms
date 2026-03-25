/**
 * @module @agentforge/agents-cicd/build-agent
 *
 * Build agent: monitors CI failures, analyzes error logs, and generates
 * fixes for known patterns. Uses claude-haiku-4-5 for fast, cost-effective
 * analysis. Operates fully autonomously (no HITL approval needed).
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
  TaskEntry,
} from '@agentforge/core';
import { Ok, Err, runAgent } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Input for the build agent. */
export interface BuildAgentInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly branch: string;
  readonly failureLogs: string;
  readonly runId: string;
}

/** Output produced by the build agent. */
export interface BuildAgentOutput {
  readonly branch: string;
  readonly fixApplied: boolean;
  readonly fixDescription: string;
  readonly totalCostUsd: number;
  readonly attempts: number;
}

/** Parsed fix from LLM output. */
interface ParsedFix {
  readonly canFix: boolean;
  readonly fixType: string;
  readonly files: ReadonlyArray<{ path: string; content: string }>;
  readonly description: string;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the build agent. */
export const BUILD_AGENT_CONTRACT: AgentContract = {
  role: 'build_agent',
  description: 'Monitors CI failures, analyzes error logs, generates fixes for known patterns',
  category: 'cicd',
  provider: 'claude-haiku-4-5',
  execution: { mode: 'complete', progress_events: false, max_context_tokens: 30000 },
  tools: ['github.read_file', 'github.push_files', 'github.trigger_workflow'],
  permissions: ['read_code', 'write_code', 'read_ci_logs', 'trigger_ci', 'create_branch'],
  denied: ['read_design', 'write_design', 'deploy_staging', 'deploy_production', 'merge_pr'],
  hitl_policy: 'fully_autonomous',
  budget: { max_tokens_per_task: 30000, max_cost_per_task_usd: 0.5 },
  on_complete: 'BuildFixComplete',
  on_error: 'retry(max=3) then notify_human + pause',
  context: {},
};

// ============================================================================
// System prompt
// ============================================================================

let systemPromptCache: string | undefined;

const loadSystemPrompt = (): string => {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'prompts',
    'build-agent-system.md',
  );
  systemPromptCache = readFileSync(promptPath, 'utf-8');
  return systemPromptCache;
};

// ============================================================================
// Helpers
// ============================================================================

/** Parse the LLM's fix output from JSON. */
export const parseBuildFixOutput = (output: string): Result<ParsedFix> => {
  const jsonMatch = /```json\s*\n?([\s\S]*?)```/.exec(output);
  const raw = jsonMatch ? jsonMatch[1] : output;

  try {
    const parsed = JSON.parse(raw.trim()) as ParsedFix;
    return Ok({
      canFix: parsed.canFix ?? false,
      fixType: parsed.fixType ?? 'unknown',
      files: parsed.files ?? [],
      description: parsed.description ?? '',
    });
  } catch {
    // If the LLM says it cannot fix, treat as a known pattern
    if (/cannot fix|unknown pattern|need human/i.test(output)) {
      return Ok({ canFix: false, fixType: 'unknown', files: [], description: output.trim() });
    }
    return Err({
      code: 'LLM_MALFORMED_OUTPUT' as const,
      message: 'Failed to parse build fix output as JSON',
      recoverable: true,
    });
  }
};

// ============================================================================
// Work function
// ============================================================================

/**
 * Build agent work function.
 * Analyzes CI failure logs and attempts to generate a fix.
 */
export const buildAgentWork: AgentWorkFn<BuildAgentInput, BuildAgentOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { task, branch, failureLogs, runId } = input;

  // 1. Build the prompt with failure context
  const systemPrompt = loadSystemPrompt();

  const userMessage = [
    `## CI Failure Logs (Run: ${runId})\n\`\`\`\n${failureLogs}\n\`\`\``,
    `\n## Branch: ${branch}`,
    `\n## Task: ${task.id} — ${task.title}`,
    learnings.length > 0
      ? `\n## Agent Learnings\n${JSON.stringify(learnings, null, 2)}`
      : '',
    '\nAnalyze the failure and respond with a fix if possible. Use the JSON format specified.',
  ].join('\n');

  const prompt = {
    system: systemPrompt,
    messages: [{ role: 'user' as const, content: userMessage }],
  };

  // 2. Call LLM
  const completionResult = await provider.complete(prompt, {
    model: context.resolvedModel ?? BUILD_AGENT_CONTRACT.provider,
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

  // 3. Parse the fix
  const fixResult = parseBuildFixOutput(content);
  if (!fixResult.ok) {
    return Err(fixResult.error);
  }

  const fix = fixResult.value;

  // 4. If a fix is available, push it via MCP
  if (fix.canFix && fix.files.length > 0) {
    const pushResult = await context.mcpClient.callTool('github', 'push_files', {
      branch,
      files: fix.files,
      message: `fix(ci): ${fix.description}`,
    });

    if (!pushResult.ok) {
      return Err({
        code: 'GIT_PUSH_FAILED' as const,
        message: `Failed to push fix to ${branch}: ${pushResult.error.message}`,
        recoverable: true,
      });
    }

    // Re-trigger CI
    await context.mcpClient.callTool('github', 'trigger_workflow', {
      workflow: 'agentforge-ci.yml',
      ref: branch,
    });
  }

  // 5. Emit BuildFixComplete
  context.eventBus.publish({
    type: 'BuildFixComplete',
    taskId: task.id,
    branch,
    fixApplied: fix.canFix,
    source: 'agent:build_fixer',
    timestamp: Date.now(),
  });

  return Ok({
    branch,
    fixApplied: fix.canFix,
    fixDescription: fix.description,
    totalCostUsd: cost.totalCostUsd,
    attempts: task.attempts + 1,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/** Execute the build agent through the full governance pipeline. */
export const executeBuildAgent = async (
  contract: AgentContract,
  context: AgentContext,
  input: BuildAgentInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_code',
    input.branch,
    `Fix CI failure on branch ${input.branch}`,
    buildAgentWork,
  );
};

/** Register the build agent to respond to CIFailed events. */
export const registerBuildAgent = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = BUILD_AGENT_CONTRACT,
): void => {
  eventBus.subscribe('CIFailed', (event) => {
    void context.eventBus.publish({
      type: 'AgentStarted',
      agentId: contract.role,
      taskId: event.taskId,
      source: `agent:${contract.role}`,
      timestamp: Date.now(),
    });
  });
};
