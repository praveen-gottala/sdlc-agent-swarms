/**
 * @module @agentforge/agents-code/frontend-coder
 *
 * Frontend Coder agent: generates React components from component specs
 * and Figma design context using streaming LLM calls.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AgentContract,
  AgentContext,
  AgentWorkFn,
  Result,
  EventBus,
  CostRecord,
  TaskEntry,
} from '@agentforge/core';
import {
  Ok,
  Err,
  runAgent,
  readYaml,
} from '@agentforge/core';
import type { StreamChunk } from '@agentforge/providers';
import {
  retryOnSelfTestFailure,
} from './retry-handler.js';
import type { RetryConfig, SelfTestResult } from './retry-handler.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the frontend coder agent. */
export interface FrontendCoderInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly stackConfigPath: string;
  readonly promptTemplatePath: string;
}

/** Output produced by the frontend coder agent. */
export interface FrontendCoderOutput {
  readonly branch: string;
  readonly filesGenerated: readonly string[];
  readonly totalCostUsd: number;
  readonly totalAttempts: number;
}

/** Parsed component spec with optional Figma design reference. */
interface ComponentSpec {
  readonly name: string;
  readonly type?: string;
  readonly props?: readonly Record<string, unknown>[];
  readonly state?: unknown;
  readonly data_source?: string;
  readonly design_ref?: string;
  readonly behavior?: unknown;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the frontend coder. */
export const FRONTEND_CODER_CONTRACT: AgentContract = {
  role: 'frontend_coder',
  description: 'Generates React components from spec + Figma context',
  category: 'code',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 100000 },
  tools: ['figma.get_code', 'github.create_branch', 'github.push_files'],
  permissions: ['read_spec', 'read_design', 'read_code', 'write_code', 'create_branch', 'trigger_ci'],
  denied: ['deploy_staging', 'deploy_production', 'merge_pr', 'write_design'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 80000, max_cost_per_task_usd: 3.0 },
  on_complete: 'CodeGenComplete',
  on_error: 'retry(max=3) then notify_human + pause',
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

/** Parse a design_ref like "figma://file_id/node_id" into parts. */
const parseDesignRef = (ref: string): { fileId: string; nodeId: string } | undefined => {
  const match = /^figma:\/\/(.+)\/(.+)$/.exec(ref);
  if (!match) return undefined;
  return { fileId: match[1], nodeId: match[2] };
};

/** Convert a PascalCase component name to kebab-case file name. */
export const toKebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** Extract code content from a markdown code block in LLM output. */
export const extractCodeFromOutput = (output: string): string => {
  const match = /```(?:tsx?|jsx?|typescript|javascript)?\n([\s\S]*?)```/.exec(output);
  return match ? match[1].trim() : output.trim();
};

/** Collect streaming output into code string and final cost record. */
export const collectStreamOutput = async (
  stream: AsyncIterable<unknown>,
): Promise<Result<{ content: string; cost: CostRecord }>> => {
  let content = '';
  let finalCost: CostRecord | undefined;

  for await (const rawChunk of stream) {
    const chunk = rawChunk as StreamChunk;
    if (chunk.type === 'token') {
      content += chunk.content;
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
// Work function
// ============================================================================

/**
 * The frontend coder's work function.
 * Called by runAgent after governance clears.
 */
export const frontendCoderWork: AgentWorkFn<FrontendCoderInput, FrontendCoderOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { task, stackConfigPath, promptTemplatePath } = input;
  const specRef = task.spec_ref;

  // 1. Read component spec from spec_ref
  const specResult = readYaml<Record<string, unknown>>(
    join(context.projectRoot, specRef),
    context.fs,
  );
  if (!specResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read component spec at ${specRef}: ${specResult.error.message}`,
      recoverable: false,
    });
  }

  const specData = specResult.value;
  const components = (specData['components'] ?? [specData]) as ComponentSpec[];
  const component = components[0];
  if (!component) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `No component found in spec ${specRef}`,
      recoverable: false,
    });
  }

  // 2. Read design context via MCP if design_ref exists
  let designContext = '';
  if (component.design_ref) {
    const parsed = parseDesignRef(component.design_ref);
    if (parsed) {
      const mcpResult = await context.mcpClient!.callTool('figma', 'get_code', {
        fileId: parsed.fileId,
        nodeId: parsed.nodeId,
      });
      if (mcpResult.ok) {
        designContext = JSON.stringify(mcpResult.value);
      }
    }
  }

  // 3. Load stack config and prompt template
  const stackConfig = loadStackConfig(stackConfigPath);
  const promptTemplate = loadPromptTemplate(promptTemplatePath);

  // 4. Build the full system prompt
  const systemPrompt = [
    promptTemplate,
    '\n## Stack Configuration\n',
    '```yaml',
    stackConfig,
    '```',
  ].join('\n');

  // 5. Build the user message with all context
  const userMessage = [
    `## Component Spec\n\`\`\`json\n${JSON.stringify(component, null, 2)}\n\`\`\``,
    designContext ? `\n## Design Context\n${designContext}` : '',
    learnings.length > 0
      ? `\n## Agent Learnings\n${JSON.stringify(learnings, null, 2)}`
      : '',
    `\nGenerate the React component "${component.name}" following all conventions above.`,
  ].join('\n');

  // 6. Define retry config from contract budget
  const retryConfig: RetryConfig = {
    maxAttempts: 3,
    maxCostUsd: FRONTEND_CODER_CONTRACT.budget.max_cost_per_task_usd,
    maxCiRetries: 3,
  };

  // 7. Define the generate function using streaming
  const generate = async (errorContext?: string) => {
    const messages = [{ role: 'user' as const, content: userMessage }];
    if (errorContext) {
      messages.push({ role: 'user' as const, content: errorContext });
    }

    const prompt = { system: systemPrompt, messages };
    const stream = provider.stream(prompt, {
      model: context.resolvedModel ?? FRONTEND_CODER_CONTRACT.provider,
      maxTokens: 8000,
      temperature: 0,
    });

    const collectResult = await collectStreamOutput(stream);
    if (!collectResult.ok) {
      return collectResult as Result<never>;
    }

    const code = extractCodeFromOutput(collectResult.value.content);
    return Ok({ code, cost: collectResult.value.cost });
  };

  // 8. Define self-test (basic syntax check via heuristic — real impl uses lint tool)
  const selfTest = async (code: string): Promise<SelfTestResult> => {
    const errors: string[] = [];

    // Basic structural checks
    if (!code.includes('export')) {
      errors.push('Missing named export — component must use named exports');
    }
    if (code.includes('export default')) {
      errors.push('Uses default export — must use named exports per convention');
    }
    if (code.includes(': any')) {
      errors.push('Contains `any` type — strict TypeScript mode forbids `any`');
    }

    return { passed: errors.length === 0, errors };
  };

  // 9. Run generation with self-test retry loop (F1)
  const genResult = await retryOnSelfTestFailure(generate, selfTest, retryConfig);
  if (!genResult.ok) {
    return genResult as Result<never>;
  }

  const { code, retryState } = genResult.value;
  const componentFileName = `${toKebabCase(component.name)}.tsx`;
  const branchName = `agentforge/task-${task.id}-${toKebabCase(component.name)}`;

  // 10. Create branch via MCP
  const branchResult = await context.mcpClient!.callTool('github', 'create_branch', {
    branch: branchName,
  });
  if (!branchResult.ok) {
    return Err({
      code: 'GIT_PUSH_FAILED' as const,
      message: `Failed to create branch ${branchName}: ${branchResult.error.message}`,
      recoverable: true,
    });
  }

  // 11. Push code to branch via MCP
  const filePath = `src/components/${componentFileName}`;
  const pushResult = await context.mcpClient!.callTool('github', 'push_files', {
    branch: branchName,
    files: [{ path: filePath, content: code }],
  });
  if (!pushResult.ok) {
    return Err({
      code: 'GIT_PUSH_FAILED' as const,
      message: `Failed to push files to ${branchName}: ${pushResult.error.message}`,
      recoverable: true,
    });
  }

  // 12. Emit CodeGenComplete event
  context.eventBus.publish({
    type: 'CodeGenComplete',
    taskId: task.id,
    agentId: FRONTEND_CODER_CONTRACT.role,
    branch: branchName,
    filesGenerated: [filePath],
    source: `agent:${FRONTEND_CODER_CONTRACT.role}`,
    timestamp: Date.now(),
  });

  return Ok({
    branch: branchName,
    filesGenerated: [filePath],
    totalCostUsd: retryState.totalCostUsd,
    totalAttempts: retryState.attempts.length,
  });
};

// ============================================================================
// Execution + Registration
// ============================================================================

/**
 * Execute the frontend coder agent through the full governance pipeline.
 */
export const executeFrontendCoder = async (
  contract: AgentContract,
  context: AgentContext,
  input: FrontendCoderInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_code',
    input.task.spec_ref,
    `Generate React component from spec ${input.task.spec_ref}`,
    frontendCoderWork,
  );
};

/**
 * Register the frontend coder to respond to TasksCreated events
 * for tasks assigned to the frontend_coder agent.
 */
export const registerFrontendCoder = (
  eventBus: EventBus,
  context: AgentContext,
  stackConfigPath: string,
  promptTemplatePath: string,
  contract: AgentContract = FRONTEND_CODER_CONTRACT,
): void => {
  eventBus.subscribe('TasksCreated', (event) => {
    for (const taskId of event.taskIds) {
      // The caller is responsible for looking up the task and checking
      // if it's assigned to frontend_coder before calling executeFrontendCoder.
      // This registration sets up the listener; the orchestrator filters tasks.
      void context.eventBus.publish({
        type: 'AgentStarted',
        agentId: contract.role,
        taskId,
        source: `agent:${contract.role}`,
        timestamp: Date.now(),
      });
    }
  });
};
