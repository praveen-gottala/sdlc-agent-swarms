/**
 * @module sink-contract
 *
 * Shared contract test suite for PipelineTelemetrySink implementations.
 * Phase 1 exports the harness; Phase 2 (CliStdoutSink) and Phase 3
 * (DashboardSseSink) import and run it against their real implementations.
 *
 * Usage in Phase 2/3:
 * ```typescript
 * import { runSinkContractTests } from '@agentforge/agents-ux/design-pipeline/__tests__/sink-contract.test';
 * runSinkContractTests(() => new CliStdoutSink(), runTestPipeline);
 * ```
 */

import type { PipelineTelemetrySink } from '../types.js';

const STAGES = ['research', 'planning', 'design', 'evaluator'] as const;

/**
 * Run the full sink contract test suite.
 *
 * @param createSink Factory that produces a fresh sink instance per test.
 * @param getCallLog Returns the ordered list of method calls the sink received.
 *   Each entry: `{ method: string; stage: string; args: unknown[] }`.
 *   The contract tests use this to verify ordering and argument validity.
 */
export function runSinkContractTests(
  createSink: () => PipelineTelemetrySink,
  getCallLog: (sink: PipelineTelemetrySink) => Array<{ method: string; stage: string; args: unknown[] }>,
): void {
  describe('PipelineTelemetrySink contract', () => {

    it('onStageStart is called before onStageComplete for each stage', () => {
      const sink = createSink();
      const attrs = { agentRole: 'test', moduleId: 'mod-1', taskId: 'task-1' };

      for (const stage of STAGES) {
        sink.onStageStart(stage, attrs);
        sink.onStageComplete(stage, { costUsd: 0.01, tokensUsed: 100 });
      }

      const log = getCallLog(sink);
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

      const log = getCallLog(sink);
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

      const log = getCallLog(sink);
      const llmEntry = log.find(e => e.method === 'onLlmCall');
      expect(llmEntry).toBeDefined();
      const receivedAttrs = llmEntry!.args[0] as typeof attrs;
      expect(receivedAttrs.promptTokens).toBeGreaterThan(0);
      expect(receivedAttrs.completionTokens).toBeGreaterThan(0);
    });

    it('stage names are consistent between start and complete', () => {
      const sink = createSink();
      const attrs = { agentRole: 'test', moduleId: 'mod-1', taskId: 'task-1' };

      sink.onStageStart('research', attrs);
      sink.onStageComplete('research', {});

      const log = getCallLog(sink);
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

      const log = getCallLog(sink);
      const logEntries = log.filter(e => e.method === 'onLog');
      expect(logEntries).toHaveLength(3);
    });
  });
}

// ── Meta-test: verify the harness is exported and callable ──

describe('sink-contract harness', () => {
  it('runSinkContractTests is a function', () => {
    expect(typeof runSinkContractTests).toBe('function');
  });
});
