/**
 * Tests for the Implementer graph builder — verifies graph compiles,
 * routing works, node names are correct, and prompt wiring at graph level.
 */

import { buildImplementerGraph, compileImplementerGraph, routeAfterLoadContext } from './implementer-graph.js';
import type { ImplementerDeps } from '../deps.js';
import type { LLMProvider, Prompt, CompletionOptions, CompletionResult } from '@agentforge/providers';
import type { ImplementerStateType } from './state.js';
import type { TaskNode } from '@agentforge/core';

function makeCost() {
  return { inputCostUsd: 0, outputCostUsd: 0, totalCostUsd: 0, model: 'mock', timestamp: new Date().toISOString() };
}

function makeMockProvider(): LLMProvider {
  return {
    name: 'mock',
    models: ['claude-opus-4-6'],
    complete: async () => ({
      ok: true as const,
      value: {
        content: 'Done.',
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: makeCost(),
        model: 'mock',
        latencyMs: 0,
        finishReason: 'stop' as const,
      },
    }),
    stream: async function*() {
      yield { type: 'done' as const, usage: { inputTokens: 0, outputTokens: 0 }, cost: makeCost() };
    },
    isAvailable: async () => true,
    estimateCost: () => ({ estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, confidence: 'high' as const }),
  };
}

const mockDeps: ImplementerDeps = {
  provider: makeMockProvider(),
  projectRoot: '/test',
  projectId: 'test',
};

function makeTask(type: string): TaskNode {
  return {
    id: 'T1',
    title: 'Test',
    description: 'Test',
    filePaths: [],
    dependencies: [],
    writeOrder: 0,
    type: type as TaskNode['type'],
    mode: 'NEW',
    estimatedTokenBudget: 10000,
    contextRefs: [],
    patternRefs: [],
    acceptanceCriteriaIds: [],
  };
}

describe('buildImplementerGraph', () => {
  it('compiles and exposes stream method', () => {
    const graph = buildImplementerGraph(mockDeps);
    const compiled = graph.compile();
    expect(typeof compiled.stream).toBe('function');
  });

  it('has all 4 nodes', () => {
    const graph = buildImplementerGraph(mockDeps);
    const nodes = graph.nodes;
    expect(Object.keys(nodes)).toEqual(
      expect.arrayContaining(['loadTaskContext', 'runDesignSpecialist', 'generateCode', 'reportCompletion']),
    );
  });
});

describe('routeAfterLoadContext', () => {
  it('routes frontend tasks to design specialist', () => {
    const state = { task: makeTask('frontend') } as ImplementerStateType;
    expect(routeAfterLoadContext(state)).toBe('runDesignSpecialist');
  });

  it('routes backend tasks to generateCode', () => {
    const state = { task: makeTask('backend') } as ImplementerStateType;
    expect(routeAfterLoadContext(state)).toBe('generateCode');
  });

  it('routes test tasks to generateCode', () => {
    const state = { task: makeTask('test') } as ImplementerStateType;
    expect(routeAfterLoadContext(state)).toBe('generateCode');
  });

  it('routes scaffold tasks to generateCode', () => {
    const state = { task: makeTask('scaffold') } as ImplementerStateType;
    expect(routeAfterLoadContext(state)).toBe('generateCode');
  });
});

describe('graph-level prompt wiring', () => {
  it('prompt sent to LLM contains task and contract data (RecordingProvider pattern)', async () => {
    const capturedPrompts: Prompt[] = [];
    const recordingProvider: LLMProvider = {
      ...makeMockProvider(),
      complete: async (prompt: Prompt, _opts: CompletionOptions) => {
        capturedPrompts.push(prompt);
        return {
          ok: true as const,
          value: {
            content: 'Done.',
            toolCalls: [],
            usage: { inputTokens: 100, outputTokens: 10 },
            cost: makeCost(),
            model: 'mock',
            latencyMs: 100,
            finishReason: 'stop' as const,
          } as CompletionResult,
        };
      },
    };

    const deps: ImplementerDeps = {
      provider: recordingProvider,
      projectRoot: '/test',
      projectId: 'test',
    };

    const compiled = compileImplementerGraph(deps);
    const task = makeTask('backend');

    await compiled.invoke({
      task: { ...task, description: 'Build the expense API' },
      contractBundle: {
        architectureSpec: {
          projectId: 'test',
          decisions: [],
          stackConfig: { frontend: 'React', backend: 'Express', database: 'PostgreSQL', styling: 'Tailwind' },
          assumptionLedgerUpdates: [],
          implementationPatterns: [{ id: 'p1', category: 'coding', title: 'Use Drizzle ORM', rule: 'All DB access via Drizzle' }],
        },
      },
      projectRoot: '/test',
    });

    expect(capturedPrompts.length).toBeGreaterThan(0);

    const firstPrompt = capturedPrompts[0];
    const userMessage = Array.isArray(firstPrompt.messages[0].content)
      ? firstPrompt.messages[0].content.map((b) => ('text' in b ? b.text : '')).join('')
      : String(firstPrompt.messages[0].content);

    expect(userMessage).toContain('Build the expense API');
    expect(userMessage).toContain('Express');
    expect(userMessage).toContain('Drizzle ORM');
  });
});
