/**
 * @module @agentforge/agents-cicd/sandbox
 *
 * GitHub Actions sandbox for running agent-generated code in isolated
 * CI environments. All GitHub interactions go through the MCP client.
 */

import type { Result, MCPClient } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** Result of a CI workflow run. */
export interface SandboxResult {
  readonly status: 'passed' | 'failed';
  readonly logs: string;
  readonly duration: number;
}

/** Options for triggering a CI workflow. */
export interface TriggerOptions {
  readonly workflow?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_WORKFLOW = 'agentforge-ci.yml';
const POLL_INTERVAL_MS = 5_000;

// ============================================================================
// Sandbox functions
// ============================================================================

/**
 * Trigger a GitHub Actions workflow for a given branch.
 * Returns the workflow run ID on success.
 */
export const triggerWorkflow = async (
  mcpClient: MCPClient,
  branch: string,
  options: TriggerOptions = {},
): Promise<Result<string>> => {
  const workflow = options.workflow ?? DEFAULT_WORKFLOW;

  const result = await mcpClient.callTool('github', 'trigger_workflow', {
    workflow,
    ref: branch,
  });

  if (!result.ok) {
    return Err({
      code: 'CI_FAILED' as const,
      message: `Failed to trigger workflow ${workflow} on ${branch}: ${result.error.message}`,
      recoverable: true,
    });
  }

  const data = result.value as { run_id?: string; id?: string };
  const runId = data.run_id ?? data.id ?? '';

  if (!runId) {
    return Err({
      code: 'CI_FAILED' as const,
      message: 'Workflow triggered but no run ID returned',
      recoverable: true,
    });
  }

  return Ok(String(runId));
};

/**
 * Poll a workflow run until it completes or the timeout is exceeded.
 * Returns the final status and duration.
 */
export const waitForResult = async (
  mcpClient: MCPClient,
  runId: string,
  timeoutMinutes: number,
): Promise<Result<SandboxResult>> => {
  const deadline = Date.now() + timeoutMinutes * 60_000;
  const startTime = Date.now();

  while (Date.now() < deadline) {
    const statusResult = await mcpClient.callTool('github', 'get_workflow_run', {
      run_id: runId,
    });

    if (!statusResult.ok) {
      return Err({
        code: 'CI_FAILED' as const,
        message: `Failed to poll workflow run ${runId}: ${statusResult.error.message}`,
        recoverable: true,
      });
    }

    const run = statusResult.value as { status?: string; conclusion?: string };

    if (run.status === 'completed') {
      const logs = await getRunLogs(mcpClient, runId);
      const logText = logs.ok ? logs.value : '';

      return Ok({
        status: run.conclusion === 'success' ? 'passed' : 'failed',
        logs: logText,
        duration: Date.now() - startTime,
      });
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return Err({
    code: 'CI_TIMEOUT' as const,
    message: `Workflow run ${runId} timed out after ${timeoutMinutes} minutes`,
    recoverable: true,
  });
};

/**
 * Fetch the full build and test logs from a completed workflow run.
 */
export const getRunLogs = async (
  mcpClient: MCPClient,
  runId: string,
): Promise<Result<string>> => {
  const result = await mcpClient.callTool('github', 'get_workflow_logs', {
    run_id: runId,
  });

  if (!result.ok) {
    return Err({
      code: 'CI_FAILED' as const,
      message: `Failed to fetch logs for run ${runId}: ${result.error.message}`,
      recoverable: true,
    });
  }

  const logs = typeof result.value === 'string'
    ? result.value
    : JSON.stringify(result.value, null, 2);

  return Ok(logs);
};

// ============================================================================
// Helpers
// ============================================================================

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
