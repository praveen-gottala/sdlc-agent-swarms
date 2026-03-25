import {
  UX_DASHBOARD_TESTING_CONTRACT,
  parseTestingOutput,
  registerUXDashboardTesting,
} from './ux-dashboard-testing.js';
import type { AgentContext, LLMProviderRef } from '@agentforge/core';
import { Ok, DEFAULT_MODEL } from '@agentforge/core';

// ============================================================================
// Helpers
// ============================================================================

const TESTING_OUTPUT = JSON.stringify({
  testRunId: 'test-mod-001-1234',
  testFilePaths: ['tests/dashboard-widget.spec.ts', 'tests/dashboard-chart.spec.ts'],
  passCount: 2,
  failCount: 0,
  healedCount: 0,
});

const TESTING_OUTPUT_WITH_FIX = JSON.stringify({
  testRunId: 'test-mod-002-5678',
  testFilePaths: ['tests/dashboard-table.spec.ts'],
  passCount: 0,
  failCount: 1,
  healedCount: 0,
  fixInstructions: 'tests/dashboard-table.spec.ts: missing @playwright import',
});

const makeProvider = (output: string = TESTING_OUTPUT): LLMProviderRef => ({
  name: 'test-provider',
  complete: jest.fn().mockResolvedValue(Ok({ content: output })),
  stream: jest.fn(),
  estimateCost: jest.fn().mockReturnValue({
    estimatedInputTokens: 1000,
    estimatedOutputTokens: 500,
    estimatedCostUsd: 0.01,
    confidence: 'medium' as const,
  }),
});

const makeContext = (): AgentContext => ({
  taskId: 'task_001',
  projectRoot: '/tmp/test-project',
  eventBus: { publish: jest.fn(), emit: jest.fn(), subscribe: jest.fn(), unsubscribe: jest.fn(), clear: jest.fn(), history: jest.fn().mockReturnValue([]) },
  fs: {
    readFile: jest.fn().mockReturnValue(Ok('pages: []')),
    writeFile: jest.fn().mockReturnValue(Ok(undefined)),
    writeFileAtomic: jest.fn().mockReturnValue(Ok(undefined)),
    exists: jest.fn().mockReturnValue(true),
    mkdir: jest.fn().mockReturnValue(Ok(undefined)),
    rename: jest.fn().mockReturnValue(Ok(undefined)),
    remove: jest.fn().mockReturnValue(Ok(undefined)),
    listDir: jest.fn().mockReturnValue(Ok([])),
    appendFile: jest.fn().mockReturnValue(Ok(undefined)),
  },
  mcpClient: {
    callTool: jest.fn().mockResolvedValue(Ok({})),
    listTools: jest.fn().mockResolvedValue(Ok([])),
    isAvailable: jest.fn().mockResolvedValue(true),
  },
  runGovernance: jest.fn().mockResolvedValue(Ok({ status: 'proceed' })),
  resolveProvider: jest.fn().mockReturnValue(Ok(makeProvider())),
  recordAudit: jest.fn(),
});

// ============================================================================
// Tests
// ============================================================================

describe('UX_DASHBOARD_TESTING_CONTRACT', () => {
  it('contract has all required AgentContract fields', () => {
    expect(UX_DASHBOARD_TESTING_CONTRACT.role).toBe('ux_dashboard_testing');
    expect(UX_DASHBOARD_TESTING_CONTRACT.category).toBe('code');
    expect(UX_DASHBOARD_TESTING_CONTRACT.provider).toBe(DEFAULT_MODEL);
    expect(UX_DASHBOARD_TESTING_CONTRACT.tools).toEqual(['playwright:snapshot', 'playwright:screenshot', 'fs:read']);
    expect(UX_DASHBOARD_TESTING_CONTRACT.permissions).toEqual(['read_spec', 'read_design', 'read_code', 'write_test']);
    expect(UX_DASHBOARD_TESTING_CONTRACT.denied).toEqual(['write_code', 'write_design', 'create_branch', 'merge_pr']);
    expect(UX_DASHBOARD_TESTING_CONTRACT.budget).toEqual({ max_tokens_per_task: 50000, max_cost_per_task_usd: 2.0 });
    expect(UX_DASHBOARD_TESTING_CONTRACT.execution).toEqual({ mode: 'complete', progress_events: true, max_context_tokens: 40000 });
    expect(UX_DASHBOARD_TESTING_CONTRACT.hitl_policy).toBe('notify_only');
  });

  it('contract on_complete matches UXTestSuiteCompleted event', () => {
    expect(UX_DASHBOARD_TESTING_CONTRACT.on_complete).toBe('UXTestSuiteCompleted');
  });
});

describe('parseTestingOutput', () => {
  it('handles valid JSON', () => {
    const result = parseTestingOutput(TESTING_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.testRunId).toBe('test-mod-001-1234');
      expect(result.value.testFilePaths).toHaveLength(2);
      expect(result.value.passCount).toBe(2);
      expect(result.value.failCount).toBe(0);
    }
  });

  it('handles JSON in code fences', () => {
    const wrappedOutput = '```json\n' + TESTING_OUTPUT + '\n```';
    const result = parseTestingOutput(wrappedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.testRunId).toBe('test-mod-001-1234');
      expect(result.value.testFilePaths).toHaveLength(2);
    }
  });

  it('returns Err for malformed JSON', () => {
    const result = parseTestingOutput('not json at all');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LLM_MALFORMED_OUTPUT');
    }
  });

  it('handles nested backticks in code-fenced JSON (LLM file content with ```)' , () => {
    const nestedOutput = '```json\n' + JSON.stringify({
      testRunId: 'test-nested-001',
      testFilePaths: ['tests/widget.spec.ts'],
      passCount: 1,
      failCount: 0,
      healedCount: 0,
    }) + '\n```\n\nHere is the explanation...';
    const result = parseTestingOutput(nestedOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.testRunId).toBe('test-nested-001');
    }
  });

  it('extracts JSON without code fences via brace matching', () => {
    const rawOutput = 'Here is the result:\n' + JSON.stringify({
      testRunId: 'test-brace-001',
      testFilePaths: ['tests/chart.spec.ts'],
      passCount: 1,
      failCount: 0,
      healedCount: 0,
    }) + '\n\nDone.';
    const result = parseTestingOutput(rawOutput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.testRunId).toBe('test-brace-001');
    }
  });
});

describe('registerUXDashboardTesting', () => {
  it('subscribes to ImplementationDraftReady', () => {
    const ctx = makeContext();
    const mockEventBus = {
      publish: jest.fn(),
      emit: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      clear: jest.fn(),
      history: jest.fn().mockReturnValue([]),
    };

    registerUXDashboardTesting(mockEventBus, ctx);

    expect(mockEventBus.subscribe).toHaveBeenCalledTimes(1);
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'ImplementationDraftReady',
      expect.any(Function),
    );
  });
});

describe('testing output fields', () => {
  it('output includes testFilePaths array', () => {
    const result = parseTestingOutput(TESTING_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value.testFilePaths)).toBe(true);
      expect(result.value.testFilePaths).toEqual([
        'tests/dashboard-widget.spec.ts',
        'tests/dashboard-chart.spec.ts',
      ]);
    }
  });

  it('fixInstructions is undefined when no issues', () => {
    const result = parseTestingOutput(TESTING_OUTPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixInstructions).toBeUndefined();
    }
  });

  it('fixInstructions is defined when issues present', () => {
    const result = parseTestingOutput(TESTING_OUTPUT_WITH_FIX);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fixInstructions).toBeDefined();
      expect(result.value.fixInstructions).toContain('missing @playwright import');
    }
  });
});
