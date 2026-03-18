/**
 * @module @agentforge/agents-cicd/deploy-agent
 *
 * Deploy agent: manages deployment to staging via GitHub Actions.
 * Monitors deployment health for 5 minutes post-deploy.
 * Phase 1 is staging only; production deploy is deferred.
 */

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

/** Input for the deploy agent. */
export interface DeployAgentInput {
  readonly task: TaskEntry;
  readonly projectRoot: string;
  readonly prNumber: number;
  readonly branch: string;
  readonly environment: 'staging' | 'production';
}

/** Output produced by the deploy agent. */
export interface DeployAgentOutput {
  readonly environment: 'staging' | 'production';
  readonly healthy: boolean;
  readonly healthCheckDuration: number;
  readonly deployRunId: string;
}

// ============================================================================
// Constants
// ============================================================================

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const HEALTH_CHECK_DURATION_MS = 5 * 60_000;

// ============================================================================
// Contract
// ============================================================================

/** The agent contract for the deploy agent. */
export const DEPLOY_AGENT_CONTRACT: AgentContract = {
  role: 'deploy_agent',
  description: 'Manages deployment to staging, monitors post-deploy health',
  category: 'cicd',
  provider: 'claude-haiku-4',
  execution: { mode: 'complete', progress_events: true, max_context_tokens: 20000 },
  tools: ['github.trigger_workflow', 'github.read_file'],
  permissions: ['read_code', 'read_ci_logs', 'trigger_ci', 'deploy_staging'],
  denied: ['write_code', 'write_design', 'deploy_production', 'merge_pr'],
  hitl_policy: 'review_and_override',
  budget: { max_tokens_per_task: 20000, max_cost_per_task_usd: 0.5 },
  on_complete: 'DeployComplete',
  on_error: 'notify_human + pause',
  context: {},
};

// ============================================================================
// Helpers
// ============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================================
// Work function
// ============================================================================

/**
 * Deploy agent work function.
 * Triggers staging deployment and monitors health post-deploy.
 */
export const deployAgentWork: AgentWorkFn<DeployAgentInput, DeployAgentOutput> = async (
  input,
  _provider,
  _learnings,
  context,
) => {
  const { task, environment, branch } = input;

  // Phase 1: Only staging deployments are supported
  if (environment === 'production') {
    return Err({
      code: 'PERMISSION_DENIED' as const,
      message: 'Production deployments are not supported in Phase 1',
      recoverable: false,
    });
  }

  // 1. Trigger deployment via GitHub Actions
  const deployResult = await context.mcpClient.callTool('github', 'trigger_workflow', {
    workflow: 'deploy-staging.yml',
    ref: branch,
  });

  if (!deployResult.ok) {
    return Err({
      code: 'CI_FAILED' as const,
      message: `Failed to trigger staging deployment: ${deployResult.error.message}`,
      recoverable: true,
    });
  }

  const deployData = deployResult.value as { run_id?: string; id?: string };
  const deployRunId = String(deployData.run_id ?? deployData.id ?? 'unknown');

  // 2. Wait for deploy workflow to complete
  const deployStatusResult = await waitForDeployCompletion(context, deployRunId);
  if (!deployStatusResult.ok) {
    context.eventBus.publish({
      type: 'DeployFailed',
      taskId: task.id,
      environment,
      reason: deployStatusResult.error.message,
      source: 'agent:deployer',
      timestamp: Date.now(),
    });
    return Err(deployStatusResult.error);
  }

  // 3. Monitor health for 5 minutes post-deploy
  const healthResult = await monitorHealth(context, task.id, environment);

  if (!healthResult.ok) {
    // Emit DeployFailed on health check failure
    context.eventBus.publish({
      type: 'DeployFailed',
      taskId: task.id,
      environment,
      reason: healthResult.error.message,
      source: 'agent:deployer',
      timestamp: Date.now(),
    });
    return Err(healthResult.error);
  }

  // 4. Emit DeployComplete
  context.eventBus.publish({
    type: 'DeployComplete',
    taskId: task.id,
    environment,
    healthy: true,
    source: 'agent:deployer',
    timestamp: Date.now(),
  });

  return Ok({
    environment,
    healthy: true,
    healthCheckDuration: healthResult.value,
    deployRunId,
  });
};

/**
 * Wait for a deploy workflow run to complete.
 */
const waitForDeployCompletion = async (
  context: AgentContext,
  runId: string,
): Promise<Result<void>> => {
  const deadline = Date.now() + 10 * 60_000; // 10-minute timeout for deploy

  while (Date.now() < deadline) {
    const statusResult = await context.mcpClient.callTool('github', 'get_workflow_run', {
      run_id: runId,
    });

    if (!statusResult.ok) {
      return Err({
        code: 'CI_FAILED' as const,
        message: `Failed to poll deploy run ${runId}: ${statusResult.error.message}`,
        recoverable: true,
      });
    }

    const run = statusResult.value as { status?: string; conclusion?: string };

    if (run.status === 'completed') {
      if (run.conclusion === 'success') {
        return Ok(undefined);
      }
      return Err({
        code: 'CI_FAILED' as const,
        message: `Deploy workflow failed with conclusion: ${run.conclusion}`,
        recoverable: true,
      });
    }

    await sleep(HEALTH_CHECK_INTERVAL_MS);
  }

  return Err({
    code: 'CI_TIMEOUT' as const,
    message: `Deploy workflow ${runId} timed out`,
    recoverable: true,
  });
};

/**
 * Monitor health endpoint for a fixed duration post-deploy.
 * Returns the total monitoring duration on success.
 */
const monitorHealth = async (
  context: AgentContext,
  taskId: string,
  environment: string,
): Promise<Result<number>> => {
  const startTime = Date.now();
  const deadline = startTime + HEALTH_CHECK_DURATION_MS;

  while (Date.now() < deadline) {
    const healthResult = await context.mcpClient.callTool('github', 'check_health', {
      environment,
      task_id: taskId,
    });

    if (!healthResult.ok) {
      return Err({
        code: 'CI_FAILED' as const,
        message: `Health check failed for ${environment}: ${healthResult.error.message}`,
        recoverable: true,
      });
    }

    const health = healthResult.value as { healthy?: boolean; status?: string };

    if (health.healthy === false || health.status === 'unhealthy') {
      return Err({
        code: 'CI_FAILED' as const,
        message: `Health check returned unhealthy for ${environment}`,
        recoverable: true,
      });
    }

    await sleep(HEALTH_CHECK_INTERVAL_MS);
  }

  return Ok(Date.now() - startTime);
};

// ============================================================================
// Execution + Registration
// ============================================================================

/** Execute the deploy agent through the full governance pipeline. */
export const executeDeployAgent = async (
  contract: AgentContract,
  context: AgentContext,
  input: DeployAgentInput,
): Promise<Result<unknown>> => {
  return runAgent(
    contract,
    context,
    input,
    'deploy_staging',
    input.environment,
    `Deploy to ${input.environment}`,
    deployAgentWork,
  );
};

/** Register the deploy agent to respond to PRMerged events. */
export const registerDeployAgent = (
  eventBus: EventBus,
  context: AgentContext,
  contract: AgentContract = DEPLOY_AGENT_CONTRACT,
): void => {
  eventBus.subscribe('PRMerged', (event) => {
    void context.eventBus.publish({
      type: 'AgentStarted',
      agentId: contract.role,
      taskId: `deploy_${event.prNumber}`,
      source: `agent:${contract.role}`,
      timestamp: Date.now(),
    });
  });
};
