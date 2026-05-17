/**
 * Wiring test: mock LLM → brownfield design pipeline → merged spec.
 *
 * Verifies the brownfield path in browserDesignWork:
 * - LLM receives submit_design_delta tool (not submit_design)
 * - Delta is extracted and validated
 * - deltaApply merges delta with existing spec
 * - Result has correct node count delta
 * - Unchanged nodes are preserved
 */

import type { Result, AgentContext } from '@agentforge/core';
import { Ok } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { browserDesignWork } from './browser-design-work.js';
import type { DesignPhaseState, NodeContext, PipelineStageError } from './types.js';

const EXISTING_SPEC: DesignSpecV2 = {
  screen: 'test-page',
  width: 1440,
  nodes: {
    root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
    header: { parent: 'root', order: 0, catalog: 'PageHeader', label: 'Test Page' },
    section1: { parent: 'root', order: 1, type: 'container', label: 'Section One', background: 'surface-primary', layout: { dir: 'column' } },
    card1: { parent: 'section1', order: 0, catalog: 'Section', label: 'Card 1' },
    card2: { parent: 'section1', order: 1, catalog: 'Section', label: 'Card 2' },
  },
};

function makeMockProvider(deltaToolCallArgs: Record<string, unknown>): { complete: jest.Mock } {
  return {
    complete: jest.fn().mockResolvedValue(Ok({
      content: '',
      toolCalls: [{
        id: 'call-1',
        name: 'submit_design_delta',
        args: deltaToolCallArgs,
      }],
      usage: { inputTokens: 1000, outputTokens: 500 },
      cost: { totalCostUsd: 0.01, inputCostUsd: 0.005, outputCostUsd: 0.005 },
      finishReason: 'tool_use',
    })),
  };
}

function makeState(overrides?: Partial<DesignPhaseState>): DesignPhaseState {
  return {
    moduleId: 'test-page',
    taskId: 'task-1',
    projectRoot: '/tmp/test',
    designTool: 'browser',
    existingDesignSpec: EXISTING_SPEC,
    ...overrides,
  };
}

function makeCtx(provider: { complete: jest.Mock }): NodeContext {
  return {
    provider: provider as unknown as NodeContext['provider'],
    agentContext: {
      resolvedModel: 'claude-sonnet-4-6',
      fs: { readFileSync: jest.fn(), writeFileSync: jest.fn(), existsSync: jest.fn() },
    } as unknown as AgentContext,
  };
}

describe('brownfield browserDesignWork', () => {
  it('dispatches to delta path when existingDesignSpec is present', async () => {
    const provider = makeMockProvider({
      screenId: 'test-page',
      baseWidth: 1440,
      added: {
        'new-card': { parent: 'section1', order: 2, catalog: 'Section', label: 'New Card' },
      },
      modified: {
        card1: { label: 'Updated Card 1' },
      },
      removed: [],
      reordered: [],
    });

    const state = makeState();
    const ctx = makeCtx(provider);

    const result = await browserDesignWork(state, ctx) as Result<Partial<DesignPhaseState>, PipelineStageError>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spec = result.value.design?.spec as unknown as DesignSpecV2;
    expect(spec).toBeDefined();

    const nodeCount = Object.keys(spec.nodes).length;
    expect(nodeCount).toBe(Object.keys(EXISTING_SPEC.nodes).length + 1);

    expect(spec.nodes['new-card']).toBeDefined();
    expect(spec.nodes['new-card'].label).toBe('New Card');

    expect(spec.nodes['card1'].label).toBe('Updated Card 1');

    expect(spec.nodes['root']).toEqual(EXISTING_SPEC.nodes['root']);
    expect(spec.nodes['header']).toEqual(EXISTING_SPEC.nodes['header']);
    expect(spec.nodes['card2']).toEqual(EXISTING_SPEC.nodes['card2']);

    const callArgs = provider.complete.mock.calls[0];
    const systemPrompt = callArgs[0].system as string;
    expect(systemPrompt).toContain('Delta Mode');
    expect(systemPrompt).toContain('submit_design_delta');

    const tools = callArgs[0].tools as Array<{ name: string }>;
    expect(tools[0].name).toBe('submit_design_delta');

    const toolChoice = callArgs[1].toolChoice as { type: string; name: string };
    expect(toolChoice.name).toBe('submit_design_delta');
  });

  it('uses greenfield path when existingDesignSpec is absent', async () => {
    const provider = makeMockProvider({});
    provider.complete.mockResolvedValue(Ok({
      content: '',
      toolCalls: [{
        id: 'call-1',
        name: 'submit_design',
        args: {
          screen: 'test-page',
          width: 1440,
          nodes: {
            root: { parent: null, order: 0, type: 'page', layout: { dir: 'column' } },
            title: { parent: 'root', order: 0, type: 'text', content: 'Hello' },
          },
        },
      }],
      usage: { inputTokens: 1000, outputTokens: 500 },
      cost: { totalCostUsd: 0.01, inputCostUsd: 0.005, outputCostUsd: 0.005 },
      finishReason: 'tool_use',
    }));

    const state = makeState({ existingDesignSpec: undefined });
    const ctx = makeCtx(provider);

    const result = await browserDesignWork(state, ctx) as Result<Partial<DesignPhaseState>, PipelineStageError>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const callArgs = provider.complete.mock.calls[0];
    const tools = callArgs[0].tools as Array<{ name: string }>;
    expect(tools[0].name).toBe('submit_design');
  });

  it('returns error when deltaApply fails (invalid parent ref)', async () => {
    const provider = makeMockProvider({
      screenId: 'test-page',
      baseWidth: 1440,
      added: {
        orphan: { parent: 'nonexistent', order: 0, type: 'text', content: 'Bad' },
      },
      modified: {},
      removed: [],
      reordered: [],
    });

    const state = makeState();
    const ctx = makeCtx(provider);

    const result = await browserDesignWork(state, ctx) as Result<Partial<DesignPhaseState>, PipelineStageError>;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('deltaApply failed');
  });

  it('returns error when delta schema validation fails', async () => {
    const provider = makeMockProvider({
      // Missing required screenId and baseWidth
      added: {},
      modified: {},
      removed: [],
      reordered: [],
    });

    const state = makeState();
    const ctx = makeCtx(provider);

    const result = await browserDesignWork(state, ctx) as Result<Partial<DesignPhaseState>, PipelineStageError>;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('validation failed');
  });

  it('handles removal delta correctly', async () => {
    const provider = makeMockProvider({
      screenId: 'test-page',
      baseWidth: 1440,
      added: {},
      modified: {},
      removed: ['card2'],
      reordered: [],
    });

    const state = makeState();
    const ctx = makeCtx(provider);

    const result = await browserDesignWork(state, ctx) as Result<Partial<DesignPhaseState>, PipelineStageError>;

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spec = result.value.design?.spec as unknown as DesignSpecV2;
    expect(Object.keys(spec.nodes).length).toBe(Object.keys(EXISTING_SPEC.nodes).length - 1);
    expect(spec.nodes['card2']).toBeUndefined();
    expect(spec.nodes['card1']).toBeDefined();
  });
});
