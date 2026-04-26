/**
 * @module dashboard-sink.test
 *
 * Contract + dashboard-specific tests for DashboardSseSink.
 *
 * Scope: This file owns all assertions about the DashboardSseSink class.
 * The 5 contract assertions are inlined here (not imported from agents-ux)
 * to avoid cross-package ESM resolution failures in Dashboard's Jest config
 * (see lessons-learned §"Cross-Package ESM Imports Break Dashboard Jest").
 */

import { DashboardSseSink } from '../dashboard-sink';
import type { SinkCallEntry } from '../dashboard-sink';

// ── Mock event-writer and run-manager to capture calls ──

const mockEmitStageEvent = jest.fn();
const mockEmitLLMCallEvent = jest.fn();
const mockEmitAgentLogEvent = jest.fn();
const mockUpdateRunStatus = jest.fn();

jest.mock('../event-writer', () => ({
  emitStageEvent: (...args: unknown[]) => mockEmitStageEvent(...args),
  emitLLMCallEvent: (...args: unknown[]) => mockEmitLLMCallEvent(...args),
  emitAgentLogEvent: (...args: unknown[]) => mockEmitAgentLogEvent(...args),
}));

jest.mock('../run-manager', () => ({
  updateRunStatus: (...args: unknown[]) => mockUpdateRunStatus(...args),
}));

const STAGES = ['research', 'planning', 'design', 'evaluator'] as const;
const TEST_ATTRS = { agentRole: 'test', moduleId: 'mod-1', taskId: 'task-1' };

function createSink(): DashboardSseSink {
  return new DashboardSseSink('run-test-1', 'design-browser', 'task-test-1');
}

function getLog(sink: DashboardSseSink): SinkCallEntry[] {
  return sink.getCallLog();
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Contract tests (inlined from sink-contract.test.ts) ──

describe('PipelineTelemetrySink contract', () => {

  it('onStageStart is called before onStageComplete for each stage', () => {
    const sink = createSink();
    for (const stage of STAGES) {
      sink.onStageStart(stage, TEST_ATTRS);
      sink.onStageComplete(stage, { costUsd: 0.01, tokensUsed: 100 });
    }

    const log = getLog(sink);
    for (const stage of STAGES) {
      const startIdx = log.findIndex(e => e.method === 'onStageStart' && e.stage === stage);
      const completeIdx = log.findIndex(e => e.method === 'onStageComplete' && e.stage === stage);
      expect(startIdx).toBeGreaterThanOrEqual(0);
      expect(completeIdx).toBeGreaterThan(startIdx);
    }
  });

  it('onStageFail receives a non-empty error string', () => {
    const sink = createSink();
    sink.onStageFail('research', 'Provider returned 500');

    const log = getLog(sink);
    const failEntry = log.find(e => e.method === 'onStageFail');
    expect(failEntry).toBeDefined();
    expect(failEntry!.args[0]).toBe('Provider returned 500');
    expect((failEntry!.args[0] as string).length).toBeGreaterThan(0);
  });

  it('onLlmCall receives positive token counts', () => {
    const sink = createSink();
    const attrs = {
      model: 'claude-sonnet-4-6',
      promptTokens: 1500,
      completionTokens: 800,
      costUsd: 0.02,
      latencyMs: 3200,
    };
    sink.onLlmCall('design', attrs);

    const log = getLog(sink);
    const llmEntry = log.find(e => e.method === 'onLlmCall');
    expect(llmEntry).toBeDefined();
    const receivedAttrs = llmEntry!.args[0] as typeof attrs;
    expect(receivedAttrs.promptTokens).toBeGreaterThan(0);
    expect(receivedAttrs.completionTokens).toBeGreaterThan(0);
  });

  it('stage names are consistent between start and complete', () => {
    const sink = createSink();
    sink.onStageStart('research', TEST_ATTRS);
    sink.onStageComplete('research', {});

    const log = getLog(sink);
    const startStages = log.filter(e => e.method === 'onStageStart').map(e => e.stage);
    const completeStages = log.filter(e => e.method === 'onStageComplete').map(e => e.stage);
    expect(startStages).toEqual(completeStages);
  });

  it('onLog receives valid log levels', () => {
    const sink = createSink();
    const validLevels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];

    for (const level of validLevels) {
      sink.onLog('research', level, `Test message at ${level}`);
    }

    const log = getLog(sink);
    const logEntries = log.filter(e => e.method === 'onLog');
    expect(logEntries).toHaveLength(3);
  });
});

// ── Dashboard-specific tests ──

describe('DashboardSseSink dashboard behavior', () => {

  it('emits capitalized stage names to event-writer', () => {
    const sink = createSink();
    sink.onStageStart('research', TEST_ATTRS);
    sink.onStageComplete('research', { costUsd: 0.01, tokensUsed: 100 });

    expect(mockEmitStageEvent).toHaveBeenCalledWith(
      'run-test-1', 'design-browser', 'Research',
      0, 3, 'started', 'test', undefined, 'task-test-1',
      'Research: running',
    );
    expect(mockEmitStageEvent).toHaveBeenCalledWith(
      'run-test-1', 'design-browser', 'Research',
      0, 3, 'completed', undefined,
      { totalCostUsd: 0.01, tokensUsed: 100 },
      'task-test-1', 'Research complete',
    );
  });

  it('maps stage indices correctly (research=0, planning=1, design=2)', () => {
    const sink = createSink();

    sink.onStageStart('research', TEST_ATTRS);
    sink.onStageStart('planning', TEST_ATTRS);
    sink.onStageStart('design', TEST_ATTRS);

    const calls = mockUpdateRunStatus.mock.calls;
    expect(calls[0][1].progress.current).toBe(0);
    expect(calls[1][1].progress.current).toBe(1);
    expect(calls[2][1].progress.current).toBe(2);
  });

  it('hides evaluator stage from UI events', () => {
    const sink = createSink();
    sink.onStageStart('evaluator', TEST_ATTRS);
    sink.onStageComplete('evaluator', { costUsd: 0.005, tokensUsed: 50 });

    expect(mockEmitStageEvent).not.toHaveBeenCalled();
    expect(mockUpdateRunStatus).not.toHaveBeenCalled();

    const log = getLog(sink);
    expect(log.filter(e => e.stage === 'evaluator')).toHaveLength(2);
  });

  it('accumulates cost and tokens across stages', () => {
    const sink = createSink();
    sink.onStageComplete('research', { costUsd: 0.01, tokensUsed: 100 });
    sink.onLlmCall('design', {
      model: 'claude-sonnet-4-6',
      promptTokens: 2000,
      completionTokens: 1000,
      costUsd: 0.05,
      latencyMs: 4000,
    });
    sink.onStageComplete('design', { costUsd: 0.03, tokensUsed: 300 });

    expect(sink.getTotalCostUsd()).toBeCloseTo(0.09, 4);
    expect(sink.getTotalTokens()).toBeCloseTo(3400, 0);
  });

  it('calls updateRunStatus with capitalized stage and stage count of 3', () => {
    const sink = createSink();
    sink.onStageStart('planning', TEST_ATTRS);

    expect(mockUpdateRunStatus).toHaveBeenCalledWith('run-test-1', expect.objectContaining({
      status: 'running',
      stage: 'Planning',
      progress: { current: 1, total: 3, label: 'Planning' },
    }));
  });

  it('onStageFail emits stage event with error message', () => {
    const sink = createSink();
    sink.onStageFail('design', 'API key expired');

    expect(mockEmitStageEvent).toHaveBeenCalledWith(
      'run-test-1', 'design-browser', 'Design',
      0, 3, 'failed', undefined, undefined, 'task-test-1',
      'Design failed: API key expired',
    );
  });

  it('onLlmCall emits LLM call event with capitalized stage', () => {
    const sink = createSink();
    sink.onLlmCall('research', {
      model: 'claude-sonnet-4-6',
      promptTokens: 1000,
      completionTokens: 500,
      costUsd: 0.02,
      latencyMs: 2500,
    });

    expect(mockEmitLLMCallEvent).toHaveBeenCalledWith(
      'run-test-1', 'Research', undefined, 'task-test-1',
      'claude-sonnet-4-6', 1000, 500, 0.02, 2500,
    );
  });
});
