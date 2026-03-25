/**
 * @module @agentforge/core/agent-runtime/base-agent
 *
 * Shared agent execution wrapper. All agent packages call `runAgent()`
 * instead of manually orchestrating governance, providers, and learnings.
 *
 * DEVIATION: ADR-022
 * PRD v2.0 Section 4.3 specifies: Python/LangGraph engine with TypeScript
 * CLI calling via REST/gRPC bridge.
 * Implementation: TypeScript-only, no Python process, no bridge. All
 * orchestration runs in-process via this module and the governance middleware.
 * Rationale: see ADR-022
 *
 * ADR-032: When workFn returns Err with recoverable: false, retries are skipped.
 */

import { join } from 'node:path';
import type { Result, AgentContract, AgentForgeError, AgentLearning } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { getActiveLearnings } from '../state/learnings-manager.js';
import type { DomainEvent } from '../events/index.js';
import type { AgentContext, AgentWorkFn, AgentRunResult } from './types.js';
import { parseErrorStrategy } from './error-strategy.js';

/**
 * Format active learnings into a "Team Conventions" section for system prompt injection.
 *
 * @param learnings - Active, non-expired learnings for the agent's role.
 * @returns A formatted string suitable for inclusion in a system prompt, or empty string if no learnings.
 */
export const formatLearningsForPrompt = (learnings: AgentLearning[]): string => {
  if (learnings.length === 0) return '';
  const items = learnings.map((l) => `- ${l.learning} (confidence: ${l.confidence})`);
  return [
    '\n## Team Conventions',
    'Based on past work on this project:',
    ...items,
  ].join('\n');
};

/**
 * Check whether this agent has been aborted.
 *
 * Fast path: checks the in-memory AbortSignal.
 * Slow path: reads the tasks YAML file and checks task status.
 */
async function checkAbort(
  context: AgentContext,
  contract: AgentContract,
): Promise<Result<void>> {
  // Fast path: in-memory signal
  if (context.abortSignal?.aborted) {
    return Err({
      code: 'AGENT_ABORTED' as const,
      message: `Agent ${contract.role} aborted via signal`,
      recoverable: false,
      agentId: contract.role,
      taskId: context.taskId,
    });
  }

  // Slow path: read task status from YAML
  const tasksPath = join(context.projectRoot, 'agentforge.tasks.yaml');
  const readResult = context.fs.readFile(tasksPath);
  if (readResult.ok) {
    try {
      // Dynamic import to avoid circular dependency — yaml is a peer
      const { parse } = await import('yaml');
      const data = parse(readResult.value) as { tasks?: Array<{ id: string; status: string }> };
      const task = data.tasks?.find((t) => t.id === context.taskId);
      if (task) {
        const abortStatuses: readonly string[] = ['aborting', 'aborted', 'failed'];
        if (abortStatuses.includes(task.status)) {
          return Err({
            code: 'AGENT_ABORTED' as const,
            message: `Agent ${contract.role} aborted (task status: ${task.status})`,
            recoverable: false,
            agentId: contract.role,
            taskId: context.taskId,
          });
        }
      }
    } catch {
      // If YAML parsing fails, continue execution
    }
  }

  return Ok(undefined);
}

/**
 * Execute an agent through the full governance → provider → work pipeline.
 *
 * @param contract - The agent's contract defining role, provider, permissions, etc.
 * @param context - Injected dependencies (event bus, fs, governance, provider resolver)
 * @param input - Agent-specific input data
 * @param actionType - The governance action type (e.g. 'write_spec', 'write_tasks')
 * @param target - The target resource for governance (e.g. file path)
 * @param description - Human-readable description of what the agent intends to do
 * @param workFn - The agent's actual work function
 * @returns Result wrapping the AgentRunResult
 */
export const runAgent = async <TInput, TOutput>(
  contract: AgentContract,
  context: AgentContext,
  input: TInput,
  actionType: string,
  target: string,
  description: string,
  workFn: AgentWorkFn<TInput, TOutput>,
): Promise<Result<AgentRunResult<TOutput>>> => {
  // 1. Resolve provider
  const providerResult = context.resolveProvider(contract.provider);
  if (!providerResult.ok) {
    return Err(providerResult.error);
  }
  const provider = providerResult.value;

  // 2. Build cost estimate
  const costEstimate = provider.estimateCost(null, { model: contract.provider });

  // 3. Run governance
  const govResult = await context.runGovernance(
    contract,
    actionType,
    target,
    description,
    costEstimate,
  );
  if (!govResult.ok) {
    return Err(govResult.error);
  }

  const outcome = govResult.value;

  // 4. Handle pause
  if (outcome.status === 'pause') {
    return Ok({ status: 'paused', gateId: outcome.gateId });
  }

  // 5. Handle denied
  if (outcome.status === 'denied') {
    return Ok({ status: 'denied', reason: outcome.reason });
  }

  // 6. Check abort before execution
  const preAbort = await checkAbort(context, contract);
  if (!preAbort.ok) {
    emitAbortEvent(context, contract, preAbort.error.message);
    return Err(preAbort.error);
  }

  // 7. Load learnings
  // DEVIATION: ADR-013
  // PRD v2.0 Section 10.1 specifies: agent contracts define context injection fields
  // Implementation: context injection (learnings, spec sections, ADRs, conventions)
  // is determined at runtime, not stored as static fields in the agent contract YAML.
  // Rationale: see ADR-013
  const learningsPath = join(context.projectRoot, '.agentforge/learnings');
  const learningsResult = await getActiveLearnings(contract.role, learningsPath);
  const learnings = learningsResult.ok ? learningsResult.value : [];

  // 8. Execute work function with retry support
  const strategy = parseErrorStrategy(contract.on_error);
  const maxAttempts = strategy.retryMax + 1;
  let lastError: AgentForgeError | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check abort at top of each retry iteration
    const retryAbort = await checkAbort(context, contract);
    if (!retryAbort.ok) {
      emitAbortEvent(context, contract, retryAbort.error.message);
      return Err(retryAbort.error);
    }

    const workResult = await workFn(input, provider, learnings, context);

    if (workResult.ok) {
      // Check abort after success, before emitting completion
      const postAbort = await checkAbort(context, contract);
      if (!postAbort.ok) {
        emitAbortEvent(context, contract, postAbort.error.message);
        return Err(postAbort.error);
      }

      // DEVIATION: ADR-021
      // PRD v2.0 Section 10.1 specifies: on_complete fires once per task completion.
      // Implementation: runAgent auto-emits on_complete; workFn implementations
      // must NOT manually emit the same event type to prevent duplicate events.
      // This is the single source of on_complete emission for all agents.
      // Rationale: see ADR-021
      if (contract.on_complete) {
        context.eventBus.publish({
          type: contract.on_complete,
          source: `agent:${contract.role}`,
          timestamp: Date.now(),
        } as DomainEvent);
      }
      context.recordAudit({
        agentId: contract.role,
        taskId: context.taskId,
        outcome: 'success',
      });

      // Return completed result
      return Ok({ status: 'completed', output: workResult.value });
    }

    lastError = workResult.error;

    // ADR-032: Non-recoverable errors must not retry — configuration/input faults
    // won't be fixed by re-running the same workFn.
    if (!workResult.error.recoverable) {
      break;
    }

    // If this isn't the last attempt, continue retrying
    if (attempt < maxAttempts - 1) {
      continue;
    }
  }

  // All retries exhausted — apply error strategy
  if (strategy.notifyHuman || strategy.pause || strategy.escalate) {
    context.recordAudit({
      agentId: contract.role,
      taskId: context.taskId,
      outcome: 'failure',
      error: lastError,
    });
  }

  return Ok({
    status: 'error',
    error: lastError ?? {
      code: 'AGENT_UNKNOWN',
      message: `Agent ${contract.role} failed after ${maxAttempts} attempts`,
      recoverable: false,
      agentId: contract.role,
      taskId: context.taskId,
    },
  });
};

/**
 * Emit AgentAborted event and record audit.
 */
function emitAbortEvent(
  context: AgentContext,
  contract: AgentContract,
  reason: string,
): void {
  context.eventBus.publish({
    type: 'AgentAborted',
    agentId: contract.role,
    taskId: context.taskId,
    reason,
    source: `agent:${contract.role}`,
    timestamp: Date.now(),
  } as DomainEvent);
  context.recordAudit({
    agentId: contract.role,
    taskId: context.taskId,
    outcome: 'aborted',
    reason,
  });
}
