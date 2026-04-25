import { createMockLLMProvider } from './index.js';

describe('createMockLLMProvider', () => {
  it('returns research result on first call', async () => {
    const provider = createMockLLMProvider();
    const result = await provider.complete(
      { system: '', messages: [] },
      { model: 'mock' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.model).toBe('mock');
    expect(result.value.latencyMs).toBe(0);
    expect(result.value.cost.totalCostUsd).toBe(0);
    // Research mock returns structured JSON with briefId
    const parsed = JSON.parse(result.value.content) as { briefId: string };
    expect(parsed.briefId).toMatch(/^brief-/);
  });

  it('returns planning result on second call', async () => {
    const provider = createMockLLMProvider();
    // First call (research)
    await provider.complete({ system: '', messages: [] }, { model: 'mock' });
    // Second call (planning)
    const result = await provider.complete(
      { system: '', messages: [] },
      { model: 'mock' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.value.content) as { specRef: string };
    expect(parsed.specRef).toMatch(/^spec-/);
  });

  it('returns design tool call on fifth call (after 2 planning correction retries)', async () => {
    const provider = createMockLLMProvider();
    // Calls: research (0), planning (1), planning-correction-1 (2), planning-correction-2 (3)
    for (let i = 0; i < 4; i++) {
      await provider.complete({ system: '', messages: [] }, { model: 'mock' });
    }
    // Fifth call = design
    const result = await provider.complete(
      { system: '', messages: [] },
      { model: 'mock' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.finishReason).toBe('tool_use');
    expect(result.value.toolCalls).toHaveLength(1);
    expect(result.value.toolCalls[0].name).toBe('submit_design');
    expect(result.value.toolCalls[0].args).toHaveProperty('nodes');
  });

  it('returns error when all mock responses are exhausted', async () => {
    const provider = createMockLLMProvider();
    // Exhaust all 5 mocks (research + planning + 2 corrections + design)
    for (let i = 0; i < 5; i++) {
      await provider.complete({ system: '', messages: [] }, { model: 'mock' });
    }
    // Sixth call should fail
    const result = await provider.complete(
      { system: '', messages: [] },
      { model: 'mock' },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('INVALID_RESPONSE');
  });

  it('reports as available', async () => {
    const provider = createMockLLMProvider();
    expect(await provider.isAvailable()).toBe(true);
  });

  it('estimates zero cost', () => {
    const provider = createMockLLMProvider();
    const estimate = provider.estimateCost(
      { system: '', messages: [] },
      { model: 'mock' },
    );
    expect(estimate.estimatedCostUsd).toBe(0);
  });

  it('has name "mock" and models list', () => {
    const provider = createMockLLMProvider();
    expect(provider.name).toBe('mock');
    expect(provider.models).toEqual(['mock']);
  });

  it('each provider instance has independent call counter', async () => {
    const p1 = createMockLLMProvider();
    const p2 = createMockLLMProvider();
    // Advance p1 to planning
    await p1.complete({ system: '', messages: [] }, { model: 'mock' });
    // p2 should still be on research (independent counter)
    const r2 = await p2.complete({ system: '', messages: [] }, { model: 'mock' });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    const parsed = JSON.parse(r2.value.content) as { briefId: string };
    expect(parsed.briefId).toMatch(/^brief-/);
  });
});
