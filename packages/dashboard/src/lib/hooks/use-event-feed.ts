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
  /** Manually refresh events from the server */
  refresh: () => void;
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
    } else if (typeof parsed['detail'] === 'string') {
      message = parsed['detail'];
    } else if (entry.action === 'PipelineRunProgress') {
      // Build human-readable message from stage/status/agentRole fields
      const stage = parsed['stage'] as string | undefined;
      const status = parsed['status'] as string | undefined;
      const agentRole = parsed['agentRole'] as string | undefined;
      const parts: string[] = [];
      if (stage) parts.push(stage);
      if (status) parts.push(status);
      if (agentRole) parts.push(`(${agentRole})`);
      if (parts.length > 0) message = parts.join(' ');
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
 * Fetches from /api/audit once on mount. Use refresh() to fetch latest.
 * No polling — avoids saturating the browser connection pool during
 * page switches and spec loading.
 */
export function useEventFeed(): UseEventFeedResult {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const localEventsRef = useRef<FeedEvent[]>([]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit?limit=${MAX_EVENTS}`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: AuditEntry[] };

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
  }, []);

  // Fetch once on mount
  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

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

  return { events, addEvent, clearEvents, refresh: fetchEvents };
}
