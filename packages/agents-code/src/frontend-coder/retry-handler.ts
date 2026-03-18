/**
 * @module @agentforge/agents-code/frontend-coder/retry-handler
 *
 * Retry logic for frontend code generation:
 * - F1: malformed LLM output (lint/parse errors) — retry with error context
 * - F6: CI pipeline failure — receive logs, send back to agent for fix
 * - Tracks cumulative cost across all retries against per-task budget
 */

import type { Result, AgentForgeError, CostRecord } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';

// ============================================================================
// Types
// ============================================================================

/** A single code generation attempt with cost tracking. */
export interface GenerationAttempt {
  readonly attemptNumber: number;
  readonly cost: CostRecord;
  readonly error?: string;
}

/** Cumulative state tracked across retries. */
export interface RetryState {
  readonly attempts: readonly GenerationAttempt[];
  readonly totalCostUsd: number;
  readonly totalTokens: number;
}

/** Configuration for retry behavior. */
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly maxCostUsd: number;
  readonly maxCiRetries: number;
}

/** Result of a self-test (lint/typecheck) on generated code. */
export interface SelfTestResult {
  readonly passed: boolean;
  readonly errors: readonly string[];
}

/** Result of a CI pipeline run. */
export interface CIResult {
  readonly passed: boolean;
  readonly logs: string;
  readonly errorSummary?: string;
}

/** Function that generates code given optional error context from a prior attempt. */
export type GenerateFn = (errorContext?: string) => Promise<Result<{ code: string; cost: CostRecord }>>;

/** Function that runs self-test (lint/typecheck) on generated code. */
export type SelfTestFn = (code: string) => Promise<SelfTestResult>;

/** Function that pushes code and waits for CI. */
export type CIPushFn = (code: string) => Promise<CIResult>;

// ============================================================================
// Retry state management
// ============================================================================

/** Create initial empty retry state. */
export const createRetryState = (): RetryState => ({
  attempts: [],
  totalCostUsd: 0,
  totalTokens: 0,
});

/** Add an attempt to the retry state, accumulating cost. */
export const addAttempt = (
  state: RetryState,
  cost: CostRecord,
  error?: string,
): RetryState => {
  const attemptNumber = state.attempts.length + 1;
  return {
    attempts: [...state.attempts, { attemptNumber, cost, error }],
    totalCostUsd: state.totalCostUsd + cost.totalCostUsd,
    totalTokens: state.totalTokens,
  };
};

// ============================================================================
// Budget check
// ============================================================================

/** Check whether accumulated cost exceeds the task budget. */
export const checkBudget = (
  state: RetryState,
  maxCostUsd: number,
): Result<void> => {
  if (state.totalCostUsd >= maxCostUsd) {
    return Err({
      code: 'BUDGET_EXCEEDED_TASK' as const,
      message: `Cumulative cost $${state.totalCostUsd.toFixed(2)} exceeds per-task budget $${maxCostUsd.toFixed(2)} after ${state.attempts.length} attempts`,
      recoverable: false,
      context: {
        totalCostUsd: state.totalCostUsd,
        limitUsd: maxCostUsd,
        attempts: state.attempts.length,
      },
    });
  }
  return Ok(undefined);
};

// ============================================================================
// F1: Malformed code retry loop
// ============================================================================

/**
 * Retry code generation when self-test (lint/typecheck) fails.
 * Each retry injects the previous error into the LLM prompt.
 * Stops on success, budget exceeded, or max attempts.
 */
export const retryOnSelfTestFailure = async (
  generate: GenerateFn,
  selfTest: SelfTestFn,
  config: RetryConfig,
): Promise<Result<{ code: string; retryState: RetryState }>> => {
  let state = createRetryState();
  let lastErrors: readonly string[] = [];

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    // Build error context from previous failed attempt
    const errorContext = lastErrors.length > 0
      ? `Previous attempt failed with errors:\n${lastErrors.join('\n')}\n\nPlease fix these issues.`
      : undefined;

    const genResult = await generate(errorContext);
    if (!genResult.ok) {
      return genResult as Result<never>;
    }

    const { code, cost } = genResult.value;
    state = addAttempt(state, cost);

    // Check budget after each attempt
    const budgetCheck = checkBudget(state, config.maxCostUsd);
    if (!budgetCheck.ok) {
      return budgetCheck as Result<never>;
    }

    // Run self-test
    const testResult = await selfTest(code);
    if (testResult.passed) {
      return Ok({ code, retryState: state });
    }

    lastErrors = testResult.errors;
    state = {
      ...state,
      attempts: state.attempts.map((a, i) =>
        i === state.attempts.length - 1
          ? { ...a, error: testResult.errors.join('; ') }
          : a,
      ),
    };
  }

  return Err({
    code: 'LLM_MALFORMED_OUTPUT' as const,
    message: `Code generation failed self-test after ${config.maxAttempts} attempts`,
    recoverable: false,
    context: {
      attempts: state.attempts.length,
      lastErrors,
      totalCostUsd: state.totalCostUsd,
    },
  });
};

// ============================================================================
// F6: CI failure retry loop
// ============================================================================

/**
 * Retry code generation when CI pipeline fails.
 * Each retry injects CI error logs into the LLM prompt.
 * Stops on success, budget exceeded, or max CI retries.
 */
export const retryOnCIFailure = async (
  generate: GenerateFn,
  pushAndRunCI: CIPushFn,
  initialCode: string,
  retryState: RetryState,
  config: RetryConfig,
): Promise<Result<{ code: string; retryState: RetryState }>> => {
  let state = retryState;
  let currentCode = initialCode;

  for (let ciAttempt = 0; ciAttempt < config.maxCiRetries; ciAttempt++) {
    const ciResult = await pushAndRunCI(currentCode);
    if (ciResult.passed) {
      return Ok({ code: currentCode, retryState: state });
    }

    // CI failed — regenerate with CI logs as context
    const errorContext = [
      'CI pipeline failed. Here are the error logs:',
      '```',
      ciResult.logs,
      '```',
      ciResult.errorSummary ? `Error summary: ${ciResult.errorSummary}` : '',
      'Please fix the code to pass CI.',
    ].join('\n');

    const genResult = await generate(errorContext);
    if (!genResult.ok) {
      return genResult as Result<never>;
    }

    const { code, cost } = genResult.value;
    currentCode = code;
    state = addAttempt(state, cost, `CI failure: ${ciResult.errorSummary ?? 'unknown'}`);

    // Check budget after each CI retry
    const budgetCheck = checkBudget(state, config.maxCostUsd);
    if (!budgetCheck.ok) {
      return budgetCheck as Result<never>;
    }
  }

  return Err({
    code: 'CI_FAILED' as const,
    message: `CI pipeline failed after ${config.maxCiRetries} retry cycles`,
    recoverable: false,
    context: {
      ciRetries: config.maxCiRetries,
      totalCostUsd: state.totalCostUsd,
      totalAttempts: state.attempts.length,
    },
  });
};

// ============================================================================
// Build failure notification
// ============================================================================

/** Build a structured error for human escalation after all retries exhausted. */
export const buildFailureNotification = (
  taskId: string,
  agentId: string,
  state: RetryState,
  lastError: AgentForgeError,
): {
  readonly taskId: string;
  readonly agentId: string;
  readonly errorCode: string;
  readonly message: string;
  readonly totalCostUsd: number;
  readonly attempts: number;
} => ({
  taskId,
  agentId,
  errorCode: lastError.code,
  message: lastError.message,
  totalCostUsd: state.totalCostUsd,
  attempts: state.attempts.length,
});
