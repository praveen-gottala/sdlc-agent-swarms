/**
 * Tests for runClarifierPipelineStream — the LangGraph streaming variant.
 * Scope: verifies the async generator yields correct event types for
 * node completions, interrupts, completions, and errors.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { ClarifierInput, ClarifierStreamEvent } from '../run.js';
import type { LLMProvider } from '@agentforge/providers';
import { MemorySaver } from '@agentforge/core';

// Mock the graph compilation to avoid real LLM calls
const mockStream = jest.fn<() => AsyncIterable<Record<string, unknown>>>();
const mockGetState = jest.fn<() => Promise<{ values: Record<string, unknown>; next: string[] }>>();
const mockUpdateState = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('../graph/clarifier-graph.js', () => ({
  compileClarifierGraph: () => ({
    stream: mockStream,
    getState: mockGetState,
    updateState: mockUpdateState,
  }),
}));

// Mock pipeline trace to verify recording calls
const mockAppendStageRecord = jest.fn();
const mockAppendQALog = jest.fn();
const mockReadLastSequence = jest.fn().mockReturnValue(-1);

jest.mock('../pipeline-trace.js', () => ({
  appendStageRecord: mockAppendStageRecord,
  appendQALog: mockAppendQALog,
  readLastSequence: mockReadLastSequence,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { runClarifierPipelineStream } = require('../run.js') as typeof import('../run.js');

function createMockProvider(): LLMProvider {
  return {
    complete: jest.fn(),
    stream: jest.fn(),
    modelId: 'test-model',
    providerName: 'test',
  } as unknown as LLMProvider;
}

function createBaseInput(overrides?: Partial<ClarifierInput>): ClarifierInput {
  return {
    rawInput: 'Build a todo app',
    mode: 'bootstrap',
    provider: createMockProvider(),
    projectRoot: '/tmp/test',
    projectId: 'test-project',
    checkpointer: new MemorySaver(),
    ...overrides,
  };
}

async function collectEvents(input: ClarifierInput): Promise<ClarifierStreamEvent[]> {
  const events: ClarifierStreamEvent[] = [];
  for await (const event of runClarifierPipelineStream(input)) {
    events.push(event);
  }
  return events;
}

describe('runClarifierPipelineStream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadLastSequence.mockReturnValue(-1);
    mockUpdateState.mockResolvedValue(undefined);
  });

  it('yields node-complete events for each graph node', async () => {
    const streamResults = [
      { contextRetriever: { context: { catalog: 'test' } } },
      { prdAnalyzer: { prdDraft: { title: 'Todo App', features: [] } } },
      { gapDetector: { gaps: [{ id: 'g1', description: 'auth missing' }] } },
    ];

    async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
      for (const result of streamResults) {
        yield result;
      }
    }

    mockStream.mockReturnValue(fakeStream());
    mockGetState.mockResolvedValue({
      values: { mode: 'bootstrap', round: 1, questions: [], gaps: [], requirement: null, assumptions: null, prdDraft: null, featurePlan: null, error: null, maxRounds: 3 },
      next: [],
    });

    const events = await collectEvents(createBaseInput());

    const nodeCompletes = events.filter((e) => e.type === 'node-complete');
    expect(nodeCompletes).toHaveLength(3);
    expect(nodeCompletes[0]).toMatchObject({ type: 'node-complete', node: 'contextRetriever' });
    expect(nodeCompletes[1]).toMatchObject({ type: 'node-complete', node: 'prdAnalyzer' });
    expect(nodeCompletes[2]).toMatchObject({ type: 'node-complete', node: 'gapDetector' });
  });

  it('yields complete event when graph finishes without interrupt', async () => {
    async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
      yield { emitComplete: {} };
    }

    mockStream.mockReturnValue(fakeStream());
    mockGetState.mockResolvedValue({
      values: {
        mode: 'bootstrap', round: 1, maxRounds: 3,
        questions: [], gaps: [], humanResponses: [],
        requirement: { prd: { title: 'App' }, confidence: 0.85 },
        assumptions: { entries: [] },
        prdDraft: { title: 'App' }, featurePlan: null, error: null,
      },
      next: [],
    });

    const events = await collectEvents(createBaseInput());

    const completeEvent = events.find((e) => e.type === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent!.type).toBe('complete');
    if (completeEvent!.type === 'complete') {
      expect(completeEvent!.threadId).toBeDefined();
    }
  });

  it('yields interrupt event when graph reaches HITL point', async () => {
    async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
      yield { contextRetriever: { context: {} } };
      yield { prdAnalyzer: { prdDraft: { title: 'App' } } };
      yield { gapDetector: { gaps: [] } };
      yield { questionPrioritizer: { questions: [{ id: 'q1', text: 'Auth?' }] } };
    }

    mockStream.mockReturnValue(fakeStream());
    mockGetState.mockResolvedValue({
      values: {
        mode: 'bootstrap', round: 1, maxRounds: 3,
        questions: [{ id: 'q1', text: 'Auth?' }], gaps: [],
        humanResponses: [],
        requirement: null, assumptions: null,
        prdDraft: { title: 'App' }, featurePlan: null, error: null,
      },
      next: ['storyWriter'],
    });

    const events = await collectEvents(createBaseInput());

    const interruptEvent = events.find((e) => e.type === 'interrupt');
    expect(interruptEvent).toBeDefined();
    if (interruptEvent?.type === 'interrupt') {
      expect(interruptEvent.state.questions).toHaveLength(1);
      expect(interruptEvent.threadId).toBeDefined();
    }
  });

  it('yields error event when graph throws', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('LLM rate limit exceeded');
    });

    const events = await collectEvents(createBaseInput());

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.message).toContain('rate limit');
    }
  });

  it('handles GraphInterrupt error as interrupt', async () => {
    mockStream.mockImplementation(() => {
      throw new Error('GraphInterrupt: awaiting human input');
    });
    mockGetState.mockResolvedValue({
      values: {
        mode: 'bootstrap', round: 1, maxRounds: 3,
        questions: [{ id: 'q1', text: 'Q?' }], gaps: [],
        humanResponses: [],
        requirement: null, assumptions: null,
        prdDraft: null, featurePlan: null, error: null,
      },
      next: ['storyWriter'],
    });

    const events = await collectEvents(createBaseInput());

    const interruptEvent = events.find((e) => e.type === 'interrupt');
    expect(interruptEvent).toBeDefined();
  });

  it('resumes via updateState + stream(null) when humanResponses provided', async () => {
    async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
      yield { storyWriter: { requirement: { prd: { title: 'App' }, confidence: 0.9 } } };
    }

    mockStream.mockReturnValue(fakeStream());
    mockGetState.mockResolvedValue({
      values: {
        mode: 'bootstrap', round: 1, maxRounds: 3,
        questions: [], gaps: [], humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
        requirement: { prd: { title: 'App' }, confidence: 0.9 },
        assumptions: { entries: [] },
        prdDraft: { title: 'App' }, featurePlan: null, error: null,
      },
      next: [],
    });

    const input = createBaseInput({
      threadId: 'existing-thread',
      humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
    });

    const events = await collectEvents(input);
    expect(events.some((e) => e.type === 'complete')).toBe(true);

    // Verify updateState was called with humanResponses
    expect(mockUpdateState).toHaveBeenCalledWith(
      expect.objectContaining({ configurable: { thread_id: 'existing-thread' } }),
      expect.objectContaining({ humanResponses: [{ questionId: 'q1', answer: 'Yes' }] }),
    );

    // Verify stream was called with null (resume pattern, not invokeInput)
    expect(mockStream).toHaveBeenCalledWith(null, expect.any(Object));
  });

  it('node-complete event for prdUpdater includes prdDraft in state', async () => {
    const updatedPrd = { title: 'App v2', features: [{ name: 'Auth', priority: 'must-have' }] };

    async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
      yield { prdUpdater: { prdDraft: updatedPrd } };
      yield { emitComplete: {} };
    }

    mockStream.mockReturnValue(fakeStream());
    mockGetState.mockResolvedValue({
      values: {
        mode: 'bootstrap', round: 1, maxRounds: 3,
        questions: [], gaps: [], humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
        requirement: { prd: updatedPrd, confidence: 0.9 },
        assumptions: { entries: [] },
        prdDraft: updatedPrd, featurePlan: null, error: null,
      },
      next: [],
    });

    const input = createBaseInput({
      threadId: 'prd-updater-thread',
      humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
    });

    const events = await collectEvents(input);

    const prdUpdaterEvent = events.find(
      (e) => e.type === 'node-complete' && e.node === 'prdUpdater',
    );
    expect(prdUpdaterEvent).toBeDefined();
    if (prdUpdaterEvent?.type === 'node-complete') {
      expect(prdUpdaterEvent.state.prdDraft).toEqual(updatedPrd);
    }
  });

  describe('execution trace recording', () => {
    it('calls appendStageRecord for each node during streaming', async () => {
      const streamResults = [
        { contextRetriever: { context: { catalog: 'test' } } },
        { prdAnalyzer: { prdDraft: { title: 'App' } } },
      ];

      async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
        for (const result of streamResults) {
          yield result;
        }
      }

      mockStream.mockReturnValue(fakeStream());
      mockGetState.mockResolvedValue({
        values: {
          mode: 'bootstrap', round: 0, maxRounds: 3,
          questions: [], gaps: [], humanResponses: [],
          requirement: null, assumptions: { entries: [] },
          prdDraft: { title: 'App' }, featurePlan: null, error: null,
        },
        next: [],
      });

      await collectEvents(createBaseInput());

      expect(mockAppendStageRecord).toHaveBeenCalledTimes(2);

      // First call: contextRetriever
      expect(mockAppendStageRecord).toHaveBeenNthCalledWith(
        1,
        '/tmp/test',
        expect.any(String),
        expect.objectContaining({
          stageName: 'contextRetriever',
          sequenceNumber: 0,
        }),
      );

      // Second call: prdAnalyzer
      expect(mockAppendStageRecord).toHaveBeenNthCalledWith(
        2,
        '/tmp/test',
        expect.any(String),
        expect.objectContaining({
          stageName: 'prdAnalyzer',
          sequenceNumber: 1,
        }),
      );
    });

    it('records synthetic hitl stage and Q&A log on resume', async () => {
      mockReadLastSequence.mockReturnValue(3);

      async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
        yield { storyWriter: { requirement: { prd: { title: 'App' }, confidence: 0.9 } } };
      }

      mockStream.mockReturnValue(fakeStream());
      mockGetState.mockResolvedValue({
        values: {
          mode: 'bootstrap', round: 1, maxRounds: 3,
          questions: [
            { id: 'q-0-0', gapId: 'gap-1', text: 'Need auth?', type: 'multiple-choice', evpiScore: 0.8 },
          ],
          gaps: [], humanResponses: [{ questionId: 'q-0-0', answer: 'Yes' }],
          requirement: { prd: { title: 'App' }, confidence: 0.9 },
          assumptions: { entries: [] },
          prdDraft: { title: 'App' }, featurePlan: null, error: null,
        },
        next: [],
      });

      const input = createBaseInput({
        threadId: 'resume-thread',
        humanResponses: [{ questionId: 'q-0-0', answer: 'Yes, add auth' }],
      });

      await collectEvents(input);

      // Should record hitl stage first (sequence = lastSeq + 1 = 4)
      expect(mockAppendStageRecord).toHaveBeenCalledWith(
        '/tmp/test',
        'resume-thread',
        expect.objectContaining({
          stageName: 'hitl',
          sequenceNumber: 4,
        }),
      );

      // Should record Q&A log
      expect(mockAppendQALog).toHaveBeenCalledWith(
        '/tmp/test',
        'resume-thread',
        expect.arrayContaining([
          expect.objectContaining({
            questionId: 'q-0-0',
            answer: 'Yes, add auth',
            gapId: 'gap-1',
            questionText: 'Need auth?',
          }),
        ]),
      );

      // Should also record the storyWriter node after hitl
      const storyWriterCall = mockAppendStageRecord.mock.calls.find(
        (call) => (call[2] as { stageName: string }).stageName === 'storyWriter',
      );
      expect(storyWriterCall).toBeDefined();
      expect((storyWriterCall![2] as { sequenceNumber: number }).sequenceNumber).toBe(5);
    });

    it('yields durationMs > 0 for first node on resume', async () => {
      // Regression test: storyWriter durationMs was 0 because timing started
      // after compiled.stream(null) had already executed the node.
      async function* delayedStream(): AsyncGenerator<Record<string, unknown>> {
        await new Promise((r) => setTimeout(r, 60));
        yield { storyWriter: { requirement: { prd: { title: 'App' }, confidence: 0.9 } } };
      }

      mockStream.mockReturnValue(delayedStream());
      mockGetState.mockResolvedValue({
        values: {
          mode: 'bootstrap', round: 1, maxRounds: 3,
          questions: [], gaps: [], humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
          requirement: { prd: { title: 'App' }, confidence: 0.9 },
          assumptions: { entries: [] },
          prdDraft: { title: 'App' }, featurePlan: null, error: null,
        },
        next: [],
      });

      const input = createBaseInput({
        threadId: 'duration-test-thread',
        humanResponses: [{ questionId: 'q1', answer: 'Yes' }],
      });

      const events = await collectEvents(input);
      const storyEvent = events.find(
        (e) => e.type === 'node-complete' && e.node === 'storyWriter',
      );
      expect(storyEvent).toBeDefined();
      if (storyEvent?.type === 'node-complete') {
        expect(storyEvent.durationMs).toBeGreaterThanOrEqual(40);
      }
    });

    it('continues recording even when appendStageRecord throws', async () => {
      mockAppendStageRecord.mockImplementation(() => {
        throw new Error('disk full');
      });

      async function* fakeStream(): AsyncGenerator<Record<string, unknown>> {
        yield { contextRetriever: { context: {} } };
        yield { prdAnalyzer: { prdDraft: { title: 'App' } } };
      }

      mockStream.mockReturnValue(fakeStream());
      mockGetState.mockResolvedValue({
        values: {
          mode: 'bootstrap', round: 0, maxRounds: 3,
          questions: [], gaps: [], humanResponses: [],
          requirement: null, assumptions: { entries: [] },
          prdDraft: { title: 'App' }, featurePlan: null, error: null,
        },
        next: [],
      });

      const events = await collectEvents(createBaseInput());

      // Pipeline should still complete despite trace failures
      expect(events.filter((e) => e.type === 'node-complete')).toHaveLength(2);
      expect(events.some((e) => e.type === 'complete')).toBe(true);
    });
  });
});
