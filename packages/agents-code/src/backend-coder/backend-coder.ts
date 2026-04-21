/**
 * @module @agentforge/agents-code/backend-coder
 *
 * Backend Coder agent: generates Express/Fastify API endpoints, Prisma schema
 * additions, and Zod validation from api.yaml and models.yaml specs.
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
import {
  retryOnSelfTestFailure,
} from '../frontend-coder/retry-handler.js';
import type { RetryConfig, SelfTestResult } from '../frontend-coder/retry-handler.js';
import {
  toKebabCase,
  extractCodeFromOutput,
  collectStreamOutput,
} from '../frontend-coder/frontend-coder.js';

// ============================================================================
// Types
// ============================================================================

/** Input for the backend coder agent. */
export interface BackendCoderInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly stackConfigPath: string;
  readonly promptTemplatePath: string;
}

/** Output produced by the backend coder agent. */
export interface BackendCoderOutput {
  readonly branch: string;
  readonly filesGenerated: readonly string[];
  readonly totalCostUsd: number;
  readonly totalAttempts: number;
}

/** Parsed endpoint spec from api.yaml. */
interface EndpointSpec {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly query_params?: readonly Record<string, unknown>[];
  readonly request_body?: unknown;
  readonly response?: Record<string, unknown>;
  readonly auth?: string;
  readonly status?: string;
}

/** Parsed data model from models.yaml. */
interface ModelSpec {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly Record<string, unknown>[];
  readonly db_table?: string;
}

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the backend coder. */
export const BACKEND_CODER_CONTRACT: AgentContract = {
  role: 'backend_coder',
  description: 'Generates API endpoints, business logic, data access layers, and Prisma migrations',
  category: 'code',
  provider: 'claude-sonnet-4-6',
  execution: { mode: 'stream', progress_events: true, max_context_tokens: 100000 },
  tools: ['github.create_branch', 'github.push_files', 'github.read_file'],
  permissions: ['read_spec', 'read_code', 'write_code', 'create_branch', 'trigger_ci'],
  denied: ['read_design', 'deploy_staging', 'deploy_production', 'merge_pr', 'write_design'],
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
// Work function
// ============================================================================

/**
 * The backend coder's work function.
 * Called by runAgent after governance clears.
 */
export const backendCoderWork: AgentWorkFn<BackendCoderInput, BackendCoderOutput> = async (
  input,
  provider,
  learnings,
  context,
) => {
  const { task, stackConfigPath, promptTemplatePath } = input;
  const specRef = task.spec_ref;

  // 1. Read API spec (api.yaml)
  const apiSpecResult = readYaml<Record<string, unknown>>(
    join(context.projectRoot, 'spec/api.yaml'),
    context.fs,
  );
  if (!apiSpecResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read API spec: ${apiSpecResult.error.message}`,
      recoverable: false,
    });
  }

  // 2. Read models spec (models.yaml)
  const modelsSpecResult = readYaml<Record<string, unknown>>(
    join(context.projectRoot, 'spec/models.yaml'),
    context.fs,
  );
  if (!modelsSpecResult.ok) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `Failed to read models spec: ${modelsSpecResult.error.message}`,
      recoverable: false,
    });
  }

  // 3. Find the relevant endpoint from spec_ref
  const apiData = apiSpecResult.value;
  const endpoints = (apiData['endpoints'] ?? []) as EndpointSpec[];
  const targetEndpoint = endpoints.find((ep) => ep.id === specRef || ep.path === specRef);
  if (!targetEndpoint) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: `No endpoint found matching spec_ref "${specRef}" in api.yaml`,
      recoverable: false,
    });
  }

  // 4. Find related models
  const modelsData = modelsSpecResult.value;
  const models = (modelsData['models'] ?? []) as ModelSpec[];

  // 5. Backend coder does NOT read design context (denied: read_design)

  // 6. Load stack config and prompt template
  const stackConfig = loadStackConfig(stackConfigPath);
  const promptTemplate = loadPromptTemplate(promptTemplatePath);

  // 7. Build the full system prompt
  const systemPrompt = [
    promptTemplate,
    '\n## Stack Configuration\n',
    '```yaml',
    stackConfig,
    '```',
  ].join('\n');

  // 8. Build the user message with all context
  const userMessage = [
    `## API Endpoint Spec\n\`\`\`json\n${JSON.stringify(targetEndpoint, null, 2)}\n\`\`\``,
    `\n## Data Models\n\`\`\`json\n${JSON.stringify(models, null, 2)}\n\`\`\``,
    learnings.length > 0
      ? `\n## Agent Learnings\n${JSON.stringify(learnings, null, 2)}`
      : '',
    `\nGenerate the API endpoint for ${targetEndpoint.method} ${targetEndpoint.path} following all conventions above.`,
  ].join('\n');

  // 9. Define retry config from contract budget
  const retryConfig: RetryConfig = {
    maxAttempts: 3,
    maxCostUsd: BACKEND_CODER_CONTRACT.budget.max_cost_per_task_usd,
    maxCiRetries: 3,
  };

  // 10. Define the generate function using streaming
  const generate = async (errorContext?: string) => {
    const messages = [{ role: 'user' as const, content: userMessage }];
    if (errorContext) {
      messages.push({ role: 'user' as const, content: errorContext });
    }

    const prompt = { system: systemPrompt, messages };
    const stream = provider.stream(prompt, {
      model: context.resolvedModel ?? BACKEND_CODER_CONTRACT.provider,
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

  // 11. Define self-test (basic checks — real impl uses lint tool)
  const selfTest = async (code: string): Promise<SelfTestResult> => {
    const errors: string[] = [];

    if (!code.includes('export')) {
      errors.push('Missing named export — route handler must use named exports');
    }
    if (code.includes('export default')) {
      errors.push('Uses default export — must use named exports per convention');
    }
    if (code.includes(': any')) {
      errors.push('Contains `any` type — strict TypeScript mode forbids `any`');
    }
    if (!code.includes('z.') && !code.includes('zod')) {
      errors.push('Missing Zod validation — all request input must be validated');
    }

    return { passed: errors.length === 0, errors };
  };

  // 12. Run generation with self-test retry loop (F1)
  const genResult = await retryOnSelfTestFailure(generate, selfTest, retryConfig);
  if (!genResult.ok) {
    return genResult as Result<never>;
  }

  const { code, retryState } = genResult.value;

  // Derive file name from endpoint path: /api/revenue → revenue.ts
  const pathSegment = targetEndpoint.path.replace(/^\/api\//, '').replace(/\//g, '-');
  const routeFileName = `${toKebabCase(pathSegment)}.ts`;
  const branchName = `agentforge/task-${task.id}-${toKebabCase(pathSegment)}`;

  // 13. Create branch via MCP
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

  // 14. Push code to branch via MCP
  const filePath = `src/routes/${routeFileName}`;
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

  // 15. Emit CodeGenComplete event
  context.eventBus.publish({
    type: 'CodeGenComplete',
    taskId: task.id,
    agentId: BACKEND_CODER_CONTRACT.role,
    branch: branchName,
    filesGenerated: [filePath],
    source: `agent:${BACKEND_CODER_CONTRACT.role}`,
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
 * Execute the backend coder agent through the full governance pipeline.
 */
export const executeBackendCoder = async (
  contract: AgentContract,
  context: AgentContext,
  input: BackendCoderInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'write_code',
    input.task.spec_ref,
    `Generate API endpoint from spec ${input.task.spec_ref}`,
    backendCoderWork,
  );
};

/**
 * Register the backend coder to respond to TasksCreated events
 * for tasks assigned to the backend_coder agent.
 */
export const registerBackendCoder = (
  eventBus: EventBus,
  context: AgentContext,
  stackConfigPath: string,
  promptTemplatePath: string,
  contract: AgentContract = BACKEND_CODER_CONTRACT,
): void => {
  eventBus.subscribe('TasksCreated', (event) => {
    for (const taskId of event.taskIds) {
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
