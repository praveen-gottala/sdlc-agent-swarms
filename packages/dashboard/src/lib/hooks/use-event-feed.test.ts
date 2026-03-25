import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useEventFeed,
  deriveSeverityFromType,
  mapAuditEntryToFeedEvent,
  AuditEntry,
  FeedEvent,
} from './use-event-feed';

/* ---------- helpers ---------- */

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-001',
    timestamp: '2026-03-25T12:00:00.000Z',
    agent: 'orchestrator',
    action: 'AgentStarted',
    resource: 'task-001',
    details: JSON.stringify({ description: 'Agent started work' }),
    phase: 'development',
    severity: 'info',
    ...overrides,
  };
}

function mockFetchSuccess(entries: AuditEntry[]): void {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ entries, total: entries.length, page: 1, limit: 50, totalPages: 1 }),
  });
}

function mockFetchFailure(): void {
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
}

/* ---------- deriveSeverityFromType ---------- */

describe('deriveSeverityFromType', () => {
  it('returns error for *Failed types', () => {
    expect(deriveSeverityFromType('AgentFailed')).toBe('error');
    expect(deriveSeverityFromType('BuildFailed')).toBe('error');
  });

  it('returns success for *Complete and *Approved types', () => {
    expect(deriveSeverityFromType('AgentCompleted')).toBe('success');
    expect(deriveSeverityFromType('ReviewComplete')).toBe('success');
    expect(deriveSeverityFromType('HITLApproved')).toBe('success');
  });

  it('returns warning for *Alert and *Requested types', () => {
    expect(deriveSeverityFromType('BudgetAlert')).toBe('warning');
    expect(deriveSeverityFromType('HITLApprovalRequested')).toBe('warning');
  });

  it('returns info for unrecognized types', () => {
    expect(deriveSeverityFromType('AgentStarted')).toBe('info');
    expect(deriveSeverityFromType('PhaseStarted')).toBe('info');
    expect(deriveSeverityFromType('unknown')).toBe('info');
  });
});

/* ---------- mapAuditEntryToFeedEvent ---------- */

describe('mapAuditEntryToFeedEvent', () => {
  it('maps audit entry fields to FeedEvent', () => {
    const entry = makeAuditEntry();
    const event = mapAuditEntryToFeedEvent(entry);

    expect(event.id).toBe('audit-001');
    expect(event.type).toBe('AgentStarted');
    expect(event.source).toBe('orchestrator');
    expect(event.timestamp).toBe(new Date('2026-03-25T12:00:00.000Z').getTime());
    expect(event.message).toBe('Agent started work');
    expect(event.severity).toBe('info');
    expect(event.metadata).toEqual({ description: 'Agent started work' });
  });

  it('uses action as message when details has no description', () => {
    const entry = makeAuditEntry({
      action: 'TestsComplete',
      details: JSON.stringify({ passCount: 5 }),
    });
    const event = mapAuditEntryToFeedEvent(entry);
    expect(event.message).toBe('TestsComplete');
  });

  it('handles invalid JSON in details gracefully', () => {
    const entry = makeAuditEntry({ details: 'not-json' });
    const event = mapAuditEntryToFeedEvent(entry);
    expect(event.message).toBe('AgentStarted');
    expect(event.metadata).toBeUndefined();
  });

  it('derives severity from action type', () => {
    const failed = mapAuditEntryToFeedEvent(makeAuditEntry({ action: 'BuildFailed' }));
    expect(failed.severity).toBe('error');

    const complete = mapAuditEntryToFeedEvent(makeAuditEntry({ action: 'CodeGenComplete' }));
    expect(complete.severity).toBe('success');
  });
});

/* ---------- useEventFeed hook ---------- */

describe('useEventFeed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [], total: 0, page: 1, limit: 50, totalPages: 0 }),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts with empty events', () => {
    const { result } = renderHook(() => useEventFeed());
    expect(result.current.events).toEqual([]);
  });

  it('fetches from /api/audit on mount', async () => {
    const entries = [makeAuditEntry()];
    mockFetchSuccess(entries);

    const { result } = renderHook(() => useEventFeed());

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    expect(result.current.events[0].id).toBe('audit-001');
    expect(global.fetch).toHaveBeenCalledWith('/api/audit?limit=50');
  });

  it('polls on 5s interval', async () => {
    mockFetchSuccess([]);
    renderHook(() => useEventFeed());

    // Initial fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Advance 5 seconds
    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    // Advance another 5 seconds
    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  it('handles fetch failure silently', async () => {
    mockFetchFailure();

    const { result } = renderHook(() => useEventFeed());

    // Wait for the fetch to complete (and fail silently)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Events should still be empty — no crash
    expect(result.current.events).toEqual([]);
  });

  it('handles non-ok response silently', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const { result } = renderHook(() => useEventFeed());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(result.current.events).toEqual([]);
  });

  it('addEvent prepends to the list', async () => {
    mockFetchSuccess([]);

    const { result } = renderHook(() => useEventFeed());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const newEvent: FeedEvent = {
      id: 'local-001',
      type: 'TestEvent',
      message: 'Test event',
      timestamp: Date.now(),
      severity: 'info',
      source: 'test',
    };

    act(() => {
      result.current.addEvent(newEvent);
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('local-001');
  });

  it('clearEvents empties the list', async () => {
    mockFetchSuccess([makeAuditEntry()]);

    const { result } = renderHook(() => useEventFeed());

    await waitFor(() => {
      expect(result.current.events).toHaveLength(1);
    });

    act(() => {
      result.current.clearEvents();
    });

    expect(result.current.events).toEqual([]);
  });

  it('preserves locally added events after poll', async () => {
    mockFetchSuccess([]);

    const { result } = renderHook(() => useEventFeed());

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const localEvent: FeedEvent = {
      id: 'local-002',
      type: 'LocalEvent',
      message: 'Added locally',
      timestamp: Date.now(),
      severity: 'info',
      source: 'test',
    };

    act(() => {
      result.current.addEvent(localEvent);
    });

    // Now set up a new poll response with server events
    mockFetchSuccess([makeAuditEntry({ id: 'audit-099' })]);

    act(() => {
      jest.advanceTimersByTime(5_000);
    });

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThanOrEqual(2);
    });

    const ids = result.current.events.map((e) => e.id);
    expect(ids).toContain('local-002');
    expect(ids).toContain('audit-099');
  });

  it('cleans up interval on unmount', () => {
    mockFetchSuccess([]);
    const { unmount } = renderHook(() => useEventFeed());

    unmount();

    // After unmount, advancing timers should not trigger more fetches
    const callCount = (global.fetch as jest.Mock).mock.calls.length;
    jest.advanceTimersByTime(15_000);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callCount);
  });
});
