import type { PipelineTelemetrySink } from '@agentforge/agents-ux';
import { CompositeSink } from '../composite-sink.js';

function createRecordingSink(): PipelineTelemetrySink & { calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  return {
    calls,
    onStageStart(stage, attrs) { calls.push({ method: 'onStageStart', args: [stage, attrs] }); },
    onStageComplete(stage, result) { calls.push({ method: 'onStageComplete', args: [stage, result] }); },
    onStageFail(stage, error) { calls.push({ method: 'onStageFail', args: [stage, error] }); },
    onLlmCall(stage, attrs) { calls.push({ method: 'onLlmCall', args: [stage, attrs] }); },
    onLog(stage, level, message) { calls.push({ method: 'onLog', args: [stage, level, message] }); },
  };
}

describe('CompositeSink', () => {
  it('forwards all callbacks to every sink', () => {
    const sink1 = createRecordingSink();
    const sink2 = createRecordingSink();
    const composite = new CompositeSink([sink1, sink2]);

    const attrs = { agentRole: 'research', moduleId: 'page-1', taskId: 'task-1' };
    composite.onStageStart('research', attrs);
    composite.onStageComplete('research', { costUsd: 0.01, tokensUsed: 100 });
    composite.onStageFail('design', 'boom');
    composite.onLlmCall('research', {
      model: 'claude-sonnet-4-6', promptTokens: 50,
      completionTokens: 25, costUsd: 0.005, latencyMs: 1200,
    });
    composite.onLog('planning', 'info', 'hello');

    expect(sink1.calls).toHaveLength(5);
    expect(sink2.calls).toHaveLength(5);

    expect(sink1.calls[0].method).toBe('onStageStart');
    expect(sink1.calls[1].method).toBe('onStageComplete');
    expect(sink1.calls[2].method).toBe('onStageFail');
    expect(sink1.calls[3].method).toBe('onLlmCall');
    expect(sink1.calls[4].method).toBe('onLog');

    expect(sink2.calls).toEqual(sink1.calls);
  });

  it('works with a single sink', () => {
    const sink = createRecordingSink();
    const composite = new CompositeSink([sink]);

    composite.onStageStart('research', { agentRole: 'r', moduleId: 'm', taskId: 't' });
    expect(sink.calls).toHaveLength(1);
  });

  it('works with empty sinks list', () => {
    const composite = new CompositeSink([]);
    expect(() => composite.onStageStart('research', { agentRole: 'r', moduleId: 'm', taskId: 't' })).not.toThrow();
  });

  it('wrapStage delegates to the first sink that implements it', async () => {
    const plainSink = createRecordingSink();
    let wrapCalled = false;
    const tracingSink: PipelineTelemetrySink = {
      ...createRecordingSink(),
      async wrapStage<T>(_stage: string, _attrs: { agentRole: string; moduleId: string; taskId: string }, fn: () => Promise<T>): Promise<T> {
        wrapCalled = true;
        return fn();
      },
    };

    const composite = new CompositeSink([plainSink, tracingSink]);
    const result = await composite.wrapStage('research', { agentRole: 'r', moduleId: 'm', taskId: 't' }, async () => 42);

    expect(wrapCalled).toBe(true);
    expect(result).toBe(42);
  });

  it('wrapStage calls fn directly when no sink implements it', async () => {
    const composite = new CompositeSink([createRecordingSink()]);
    const result = await composite.wrapStage('research', { agentRole: 'r', moduleId: 'm', taskId: 't' }, async () => 'hello');
    expect(result).toBe('hello');
  });
});
