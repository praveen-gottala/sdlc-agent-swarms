'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** A single event in the activity feed */
export interface FeedEvent {
  readonly id: string;
  readonly type: string;
  readonly message: string;
  readonly timestamp: number;
  readonly severity: 'info' | 'warning' | 'error' | 'success';
  readonly source: string;
  readonly metadata?: Record<string, unknown>;
}

/** Return type for the useEventFeed hook */
export interface UseEventFeedResult {
  /** Recent events, most recent first */
  readonly events: readonly FeedEvent[];
  /** Add a new event to the feed */
  addEvent: (event: FeedEvent) => void;
  /** Clear all events */
  clearEvents: () => void;
}

/** Shape of an entry returned by /api/audit */
export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly agent: string;
  readonly action: string;
  readonly resource: string;
  readonly details: string;
  readonly phase: string;
  readonly severity: string;
}

const MAX_EVENTS = 50;
const POLL_INTERVAL_MS = 5_000;

/** Derive severity from the event type name when the raw data has no explicit severity */
export function deriveSeverityFromType(
  action: string,
): 'info' | 'warning' | 'error' | 'success' {
  if (/failed/i.test(action)) return 'error';
  if (/complete/i.test(action) || /approved/i.test(action)) return 'success';
  if (/alert/i.test(action) || /requested/i.test(action)) return 'warning';
  return 'info';
}

/** Convert an audit API entry to a FeedEvent */
export function mapAuditEntryToFeedEvent(entry: AuditEntry): FeedEvent {
  let metadata: Record<string, unknown> | undefined;
  let message = entry.action;

  try {
    const parsed = JSON.parse(entry.details) as Record<string, unknown>;
    metadata = parsed;
    if (typeof parsed['description'] === 'string') {
      message = parsed['description'];
    }
  } catch {
    // details is not valid JSON — use action as message
  }

  const severity = deriveSeverityFromType(entry.action);

  return {
    id: entry.id,
    type: entry.action,
    message,
    timestamp: new Date(entry.timestamp).getTime(),
    severity,
    source: entry.agent,
    metadata,
  };
}

/**
 * Activity feed hook that maintains a list of recent events (max 50).
 * Polls /api/audit for real events. Starts with an empty feed.
 */
export function useEventFeed(): UseEventFeedResult {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const localEventsRef = useRef<FeedEvent[]>([]);

  useEffect(() => {
    let active = true;

    async function fetchEvents(): Promise<void> {
      try {
        const res = await fetch(`/api/audit?limit=${MAX_EVENTS}`);
        if (!res.ok) return;
        const data = (await res.json()) as { entries: AuditEntry[] };
        if (!active) return;

        const fetched = data.entries.map(mapAuditEntryToFeedEvent);
        const local = localEventsRef.current;

        // Merge: local events first (newest), then fetched, deduplicated
        const fetchedIds = new Set(fetched.map((e) => e.id));
        const uniqueLocal = local.filter((e) => !fetchedIds.has(e.id));
        const merged = [...uniqueLocal, ...fetched].slice(0, MAX_EVENTS);

        setEvents(merged);
      } catch {
        // Silently ignore fetch errors — dashboard should not crash
      }
    }

    void fetchEvents();
    const interval = setInterval(() => void fetchEvents(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const addEvent = useCallback((event: FeedEvent) => {
    localEventsRef.current = [event, ...localEventsRef.current];
    setEvents((prev) => {
      const next = [event, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
  }, []);

  const clearEvents = useCallback(() => {
    localEventsRef.current = [];
    setEvents([]);
  }, []);

  return { events, addEvent, clearEvents };
}
