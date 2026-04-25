/**
 * Tests for CliStdoutSink.
 *
 * Runs the shared sink contract tests from @agentforge/agents-ux,
 * plus CLI-specific formatting assertions.
 */

import { PassThrough } from 'node:stream';
import { CliStdoutSink } from './cli-sink.js';
// The sink contract harness lives in agents-ux's test directory; resolved via
// the '^@agentforge/agents-ux/(.*)$' moduleNameMapper in jest.config.cjs.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — cross-package test import resolved by Jest moduleNameMapper, not tsc
import { runSinkContractTests } from '@agentforge/agents-ux/design-pipeline/__tests__/sink-contract.test';

// ── Sink contract tests ──

runSinkContractTests(
  () => new CliStdoutSink(new PassThrough()),
  (sink: unknown) => (sink as CliStdoutSink).getCallLog(),
);

// ── CLI-specific formatting tests ──

describe('CliStdoutSink formatting', () => {
  let output: PassThrough;
  let sink: CliStdoutSink;
  let collected: string;

  beforeEach(() => {
    output = new PassThrough();
    collected = '';
    output.on('data', (chunk: Buffer) => { collected += chunk.toString(); });
    sink = new CliStdoutSink(output);
  });

  it('renders stage start with index and stage name', () => {
    sink.onStageStart('research', { agentRole: 'research', moduleId: 'mod-1', taskId: 'task-1' });

    expect(collected).toContain('[1/3]');
    expect(collected).toContain('Research');
    expect(collected).toContain('running');
  });

  it('renders stage complete with green checkmark', () => {
    sink.onStageComplete('planning', { costUsd: 0.05 });

    expect(collected).toContain('Planning complete');
    expect(collected).toContain('$0.0500');
    expect(collected).toContain('\x1b[32m');
  });

  it('renders stage fail with red X', () => {
    sink.onStageFail('design', 'Provider returned 500');

    expect(collected).toContain('Design failed');
    expect(collected).toContain('Provider returned 500');
    expect(collected).toContain('\x1b[31m');
  });

  it('filters evaluator stage from stdout display', () => {
    sink.onStageStart('evaluator', { agentRole: 'evaluator', moduleId: 'mod-1', taskId: 'task-1' });
    sink.onStageComplete('evaluator', {});

    expect(collected).toBe('');
  });

  it('still records evaluator events in callLog', () => {
    sink.onStageStart('evaluator', { agentRole: 'evaluator', moduleId: 'mod-1', taskId: 'task-1' });
    sink.onStageComplete('evaluator', {});

    const log = sink.getCallLog();
    expect(log).toHaveLength(2);
    expect(log[0].method).toBe('onStageStart');
    expect(log[0].stage).toBe('evaluator');
    expect(log[1].method).toBe('onStageComplete');
    expect(log[1].stage).toBe('evaluator');
  });

  it('routes log levels to correct formatters', () => {
    sink.onLog('research', 'info', 'Loaded cached research');
    expect(collected).toContain('\x1b[34m');

    sink.onLog('research', 'warn', 'Missing tokens');
    expect(collected).toContain('\x1b[33m');

    sink.onLog('research', 'error', 'Fatal error');
    expect(collected).toContain('\x1b[31m');
  });

  it('accumulates cost and tokens across LLM calls', () => {
    sink.onLlmCall('research', { model: 'claude-sonnet-4-6', promptTokens: 1000, completionTokens: 500, costUsd: 0.01, latencyMs: 2000 });
    sink.onLlmCall('design', { model: 'claude-sonnet-4-6', promptTokens: 2000, completionTokens: 1000, costUsd: 0.03, latencyMs: 5000 });

    expect(sink.getTotalCostUsd()).toBeCloseTo(0.04);
    expect(sink.getTotalTokens()).toBe(4500);
  });
});
