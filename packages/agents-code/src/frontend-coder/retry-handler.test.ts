import {
  createRetryState,
  addAttempt,
  checkBudget,
  retryOnSelfTestFailure,
  retryOnCIFailure,
  buildFailureNotification,
} from './retry-handler.js';
import type { RetryConfig, GenerateFn, SelfTestFn, CIPushFn, CIResult } from './retry-handler.js';
import type { CostRecord } from '@agentforge/core';
import { Ok, DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const makeCost = (totalCostUsd: number): CostRecord => ({
  inputCostUsd: totalCostUsd * 0.3,
  outputCostUsd: totalCostUsd * 0.7,
  totalCostUsd,
  model: DEFAULT_MODEL,
  timestamp: new Date().toISOString(),
});

const defaultConfig: RetryConfig = {
  maxAttempts: 3,
  maxCostUsd: 3.0,
  maxCiRetries: 3,
};

// ============================================================================
// createRetryState
// ============================================================================

describe('createRetryState', () => {
  it('starts with zero attempts and zero cost', () => {
    const state = createRetryState();
    expect(state.attempts).toEqual([]);
    expect(state.totalCostUsd).toBe(0);
    expect(state.totalTokens).toBe(0);
  });
});

// ============================================================================
// addAttempt
// ============================================================================

describe('addAttempt', () => {
  it('accumulates cost across attempts', () => {
    let state = createRetryState();
    state = addAttempt(state, makeCost(0.50));
    state = addAttempt(state, makeCost(0.75));

    expect(state.attempts.length).toBe(2);
    expect(state.totalCostUsd).toBeCloseTo(1.25);
  });

  it('records error on attempt when provided', () => {
    let state = createRetryState();
    state = addAttempt(state, makeCost(0.10), 'syntax error');

    expect(state.attempts[0].error).toBe('syntax error');
  });
});

// ============================================================================
// checkBudget
// ============================================================================

describe('checkBudget', () => {
  it('returns Ok when under budget', () => {
    let state = createRetryState();
    state = addAttempt(state, makeCost(1.0));

    const result = checkBudget(state, 3.0);
    expect(result.ok).toBe(true);
  });

  it('returns Err with BUDGET_EXCEEDED_TASK when over budget', () => {
    let state = createRetryState();
    state = addAttempt(state, makeCost(2.0));
    state = addAttempt(state, makeCost(1.5));

    const result = checkBudget(state, 3.0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }
  });
});

// ============================================================================
// retryOnSelfTestFailure (F1)
// ============================================================================

describe('retryOnSelfTestFailure', () => {
  it('returns code on first successful attempt', async () => {
    const generate: GenerateFn = jest.fn().mockResolvedValue(
      Ok({ code: 'export const Foo = () => <div />;', cost: makeCost(0.50) }),
    );
    const selfTest: SelfTestFn = jest.fn().mockResolvedValue({ passed: true, errors: [] });

    const result = await retryOnSelfTestFailure(generate, selfTest, defaultConfig);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.code).toContain('export const Foo');
      expect(result.value.retryState.attempts.length).toBe(1);
    }
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('retries with error context when self-test fails', async () => {
    const generate: GenerateFn = jest.fn()
      .mockResolvedValueOnce(Ok({ code: 'export default Foo;', cost: makeCost(0.50) }))
      .mockResolvedValueOnce(Ok({ code: 'export const Foo = () => <div />;', cost: makeCost(0.50) }));

    const selfTest: SelfTestFn = jest.fn()
      .mockResolvedValueOnce({ passed: false, errors: ['Uses default export'] })
      .mockResolvedValueOnce({ passed: true, errors: [] });

    const result = await retryOnSelfTestFailure(generate, selfTest, defaultConfig);

    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(2);
    // Second call should include error context
    const secondCallArg = (generate as jest.Mock).mock.calls[1][0] as string;
    expect(secondCallArg).toContain('Uses default export');
  });

  it('returns LLM_MALFORMED_OUTPUT after max attempts exhausted', async () => {
    const generate: GenerateFn = jest.fn().mockResolvedValue(
      Ok({ code: 'bad code', cost: makeCost(0.30) }),
    );
    const selfTest: SelfTestFn = jest.fn().mockResolvedValue({
      passed: false,
      errors: ['Missing export'],
    });

    const result = await retryOnSelfTestFailure(generate, selfTest, defaultConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it('stops with BUDGET_EXCEEDED_TASK when cumulative cost exceeds limit', async () => {
    const generate: GenerateFn = jest.fn().mockResolvedValue(
      Ok({ code: 'bad', cost: makeCost(1.50) }),
    );
    const selfTest: SelfTestFn = jest.fn().mockResolvedValue({
      passed: false,
      errors: ['error'],
    });

    const result = await retryOnSelfTestFailure(generate, selfTest, defaultConfig);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUDGET_EXCEEDED_TASK');
    }
    // Should stop after 2 attempts ($1.50 + $1.50 = $3.00 >= $3.00)
    expect(generate).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// retryOnCIFailure (F6)
// ============================================================================

describe('retryOnCIFailure', () => {
  it('returns code when CI passes on first try', async () => {
    const generate: GenerateFn = jest.fn();
    const pushAndRunCI: CIPushFn = jest.fn().mockResolvedValue({
      passed: true,
      logs: '',
    } satisfies CIResult);

    const result = await retryOnCIFailure(
      generate,
      pushAndRunCI,
      'const Foo = () => <div />;',
      createRetryState(),
      defaultConfig,
    );

    expect(result.ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });

  it('sends CI logs to generate function on failure and retries', async () => {
    const generate: GenerateFn = jest.fn().mockResolvedValue(
      Ok({ code: 'export const Foo = () => <div />;', cost: makeCost(0.50) }),
    );
    const pushAndRunCI: CIPushFn = jest.fn()
      .mockResolvedValueOnce({
        passed: false,
        logs: 'TypeError: missing import',
        errorSummary: 'Missing import statement',
      } satisfies CIResult)
      .mockResolvedValueOnce({ passed: true, logs: '' } satisfies CIResult);

    const result = await retryOnCIFailure(
      generate,
      pushAndRunCI,
      'bad code',
      createRetryState(),
      defaultConfig,
    );

    expect(result.ok).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
    const errorCtx = (generate as jest.Mock).mock.calls[0][0] as string;
    expect(errorCtx).toContain('TypeError: missing import');
  });

  it('returns CI_FAILED after max CI retries exhausted', async () => {
    const generate: GenerateFn = jest.fn().mockResolvedValue(
      Ok({ code: 'still broken', cost: makeCost(0.20) }),
    );
    const pushAndRunCI: CIPushFn = jest.fn().mockResolvedValue({
      passed: false,
      logs: 'build failed',
      errorSummary: 'Build error',
    } satisfies CIResult);

    const result = await retryOnCIFailure(
      generate,
      pushAndRunCI,
      'bad code',
      createRetryState(),
      defaultConfig,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CI_FAILED');
    }
  });
});

// ============================================================================
// buildFailureNotification
// ============================================================================

describe('buildFailureNotification', () => {
  it('includes task context and cost summary', () => {
    let state = createRetryState();
    state = addAttempt(state, makeCost(1.0));
    state = addAttempt(state, makeCost(0.5));

    const notification = buildFailureNotification(
      'task_001',
      'frontend_coder',
      state,
      {
        code: 'LLM_MALFORMED_OUTPUT',
        message: 'Failed after 3 attempts',
        recoverable: false,
      },
    );

    expect(notification.taskId).toBe('task_001');
    expect(notification.agentId).toBe('frontend_coder');
    expect(notification.errorCode).toBe('LLM_MALFORMED_OUTPUT');
    expect(notification.totalCostUsd).toBeCloseTo(1.5);
    expect(notification.attempts).toBe(2);
  });
});
