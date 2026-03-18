/**
 * @module @agentforge/core/agent-runtime/base-agent
 *
 * Shared agent execution wrapper. All agent packages call `runAgent()`
 * instead of manually orchestrating governance, providers, and learnings.
 */

import { join } from 'node:path';
import type { Result, AgentContract, AgentForgeError } from '../types/index.js';
import { Ok, Err } from '../types/index.js';
import { getActiveLearnings } from '../state/learnings-manager.js';
import type { DomainEvent } from '../events/index.js';
import type { AgentContext, AgentWorkFn, AgentRunResult } from './types.js';
import { parseErrorStrategy } from './error-strategy.js';

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

  // 6. Check abort signal
  if (context.abortSignal?.aborted) {
    return Err({
      code: 'AGENT_ABORTED',
      message: `Agent ${contract.role} aborted before execution`,
      recoverable: false,
      agentId: contract.role,
      taskId: context.taskId,
    });
  }

  // 7. Load learnings
  const learningsPath = join(context.projectRoot, '.agentforge/learnings');
  const learningsResult = await getActiveLearnings(contract.role, learningsPath);
  const learnings = learningsResult.ok ? learningsResult.value : [];

  // 8. Execute work function with retry support
  const strategy = parseErrorStrategy(contract.on_error);
  const maxAttempts = strategy.retryMax + 1;
  let lastError: AgentForgeError | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const workResult = await workFn(input, provider, learnings, context);

    if (workResult.ok) {
      // 10. On success: emit on_complete event, record audit
      if (contract.on_complete) {
        context.eventBus.publish({
          type: contract.on_complete,
          timestamp: Date.now(),
        } as DomainEvent);
      }
      context.recordAudit({
        agentId: contract.role,
        taskId: context.taskId,
        outcome: 'success',
      });

      // 11. Return completed result
      return Ok({ status: 'completed', output: workResult.value });
    }

    lastError = workResult.error;

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
