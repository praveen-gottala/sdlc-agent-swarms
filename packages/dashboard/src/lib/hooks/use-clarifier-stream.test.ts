/**
 * Tests for useClarifierStream hook.
 * Scope: SSE event parsing, chat message building, state transitions.
 * Uses mock fetch with ReadableStream to simulate SSE.
 */

import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'node:util';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { renderHook, act } from '@testing-library/react';
import { useClarifierStream } from './use-clarifier-stream';

// Polyfill for Jest environment (jsdom doesn't include these)
if (typeof globalThis.TextEncoder === 'undefined') {
  (globalThis as Record<string, unknown>).TextEncoder = NodeTextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  (globalThis as Record<string, unknown>).TextDecoder = NodeTextDecoder;
}
if (typeof globalThis.ReadableStream === 'undefined') {
  (globalThis as Record<string, unknown>).ReadableStream = NodeReadableStream;
}

function createSSEStream(events: Array<{ event: string; data: unknown }>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const { event, data } of events) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }
      controller.close();
    },
  });
}

function mockFetchSSE(events: Array<{ event: string; data: unknown }>): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    body: createSSEStream(events),
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  });
}

describe('useClarifierStream', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('initializes with welcome phase', () => {
    const { result } = renderHook(() => useClarifierStream());

    expect(result.current.phase).toBe('welcome');
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.prdDraft).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('startClarifier transitions to running phase and adds messages', async () => {
    mockFetchSSE([
      { event: 'stage', data: { stage: 'contextRetriever', label: 'Loading...', index: 0, total: 8 } },
      {
        event: 'result',
        data: {
          threadId: 'test-thread',
          interrupted: true,
          state: {
            mode: 'bootstrap', round: 1, maxRounds: 3,
            questions: [{ id: 'q1', gapId: 'g1', text: 'Auth method?', type: 'multiple-choice', priority: 1, evpiScore: 0.8 }],
            gaps: [], requirement: null, assumptions: null, prdDraft: null, featurePlan: null, error: null,
          },
        },
      },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build a todo app');
      // Wait for async fetch to complete
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should have transitioned from welcome → running → questions
    expect(result.current.phase).toBe('questions');
    expect(result.current.threadId).toBe('test-thread');
    // Messages should include: user-seed, agent-thinking, stage tool-result, agent-question
    expect(result.current.messages.length).toBeGreaterThanOrEqual(3);
    expect(result.current.messages[0].payload.kind).toBe('user-seed');
  });

  it('handles prd-draft SSE event', async () => {
    mockFetchSSE([
      { event: 'prd-draft', data: { prdDraft: { title: 'Todo App', features: [{ id: 'f1' }], personas: [] } } },
      {
        event: 'result',
        data: {
          threadId: 'test-thread',
          interrupted: false,
          state: {
            mode: 'bootstrap', round: 1, maxRounds: 3,
            questions: [], gaps: [],
            requirement: { prd: { title: 'Todo App', features: [{ id: 'f1' }] }, confidence: 0.85 },
            assumptions: { entries: [] }, prdDraft: { title: 'Todo App', features: [{ id: 'f1' }] },
            featurePlan: null, error: null,
          },
        },
      },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build a todo app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.prdDraft).not.toBeNull();
    expect((result.current.prdDraft as Record<string, unknown>).title).toBe('Todo App');
  });

  it('handles gaps SSE event', async () => {
    mockFetchSSE([
      { event: 'gaps', data: { gaps: [{ id: 'g1', description: 'Auth missing', category: 'missing', confidence: 0.3, deterministic: true }] } },
      {
        event: 'result',
        data: {
          threadId: 'test-thread',
          interrupted: true,
          state: {
            mode: 'bootstrap', round: 1, maxRounds: 3,
            questions: [{ id: 'q1', gapId: 'g1', text: 'Auth?', type: 'open', priority: 1, evpiScore: 0.9 }],
            gaps: [{ id: 'g1', description: 'Auth missing', category: 'missing', confidence: 0.3, deterministic: true }],
            requirement: null, assumptions: null, prdDraft: null, featurePlan: null, error: null,
          },
        },
      },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build an app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.gaps).toHaveLength(1);
    expect(result.current.gaps[0].id).toBe('g1');
  });

  it('handles error SSE event', async () => {
    mockFetchSSE([
      { event: 'error', data: { error: 'LLM rate limit exceeded', code: 'GRAPH_ERROR' } },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build an app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('LLM rate limit exceeded');
  });

  it('handles HTTP error response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: jest.fn().mockResolvedValue(JSON.stringify({ error: 'No API key configured' })),
    });

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build an app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('No API key configured');
  });

  it('reset clears all state', async () => {
    mockFetchSSE([
      { event: 'error', data: { error: 'Some error' } },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build an app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.phase).toBe('error');

    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('welcome');
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(result.current.prdDraft).toBeNull();
  });

  it('addUserAnswer appends a user-answer message', () => {
    const { result } = renderHook(() => useClarifierStream());

    act(() => {
      result.current.addUserAnswer('q1', 'Auth method?', 'OAuth 2.0', 'OAuth 2.0');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].payload.kind).toBe('user-answer');
    if (result.current.messages[0].payload.kind === 'user-answer') {
      expect(result.current.messages[0].payload.answer).toBe('OAuth 2.0');
    }
  });

  it('escalation abandon resets to welcome', async () => {
    // First get into escalation state
    mockFetchSSE([
      {
        event: 'result',
        data: {
          threadId: 'test-thread',
          interrupted: true,
          state: {
            mode: 'bootstrap', round: 3, maxRounds: 3,
            questions: [{ id: 'q1', gapId: 'g1', text: 'Q?', type: 'open', priority: 1, evpiScore: 0.5 }],
            gaps: [], requirement: null, assumptions: null, prdDraft: null, featurePlan: null, error: null,
          },
        },
      },
    ]);

    const { result } = renderHook(() => useClarifierStream());

    await act(async () => {
      result.current.startClarifier('Build an app');
      await new Promise((r) => setTimeout(r, 200));
    });

    expect(result.current.phase).toBe('escalation');

    act(() => {
      result.current.submitEscalation('abandon');
    });

    expect(result.current.phase).toBe('welcome');
    expect(result.current.messages).toHaveLength(0);
  });
});
