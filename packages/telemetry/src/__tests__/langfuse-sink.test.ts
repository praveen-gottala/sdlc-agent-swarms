import { LangfuseSink, createLangfuseSink } from '../langfuse-sink.js';

describe('LangfuseSink', () => {
  it('createLangfuseSink returns null when LANGFUSE_SECRET_KEY is not set', () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = createLangfuseSink('trace-1');
    expect(sink).toBeNull();
  });

  it('wrapStage calls fn directly when unconfigured', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = new LangfuseSink('trace-1');
    let called = false;

    await sink.wrapStage('research', { agentRole: 'ux-research', moduleId: 'mod-1', taskId: 'task-1' }, async () => {
      called = true;
      return 'result';
    });

    expect(called).toBe(true);
  });

  it('wrapStage returns fn result', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = new LangfuseSink('trace-1');

    const result = await sink.wrapStage('design', { agentRole: 'ux-design', moduleId: 'mod-1', taskId: 'task-1' }, async () => {
      return { score: 85 };
    });

    expect(result).toEqual({ score: 85 });
  });

  it('wrapStage propagates errors from fn', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = new LangfuseSink('trace-1');

    await expect(
      sink.wrapStage('planning', { agentRole: 'ux-planning', moduleId: 'mod-1', taskId: 'task-1' }, async () => {
        throw new Error('LLM rate limited');
      }),
    ).rejects.toThrow('LLM rate limited');
  });

  it('onStageStart/Complete/Fail do not throw', () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = new LangfuseSink('trace-1');

    expect(() => {
      sink.onStageStart('research', { agentRole: 'ux-research', moduleId: 'mod-1', taskId: 'task-1' });
      sink.onStageComplete('research', { costUsd: 0.05, tokensUsed: 1000 });
      sink.onStageFail('design', 'test error');
    }).not.toThrow();
  });

  it('onLlmCall and onLog do not throw', () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    const sink = new LangfuseSink('trace-1');

    expect(() => {
      sink.onLlmCall('design', { model: 'claude-sonnet-4-6', promptTokens: 100, completionTokens: 200, costUsd: 0.01, latencyMs: 500 });
      sink.onLog('research', 'info', 'test message');
    }).not.toThrow();
  });
});
