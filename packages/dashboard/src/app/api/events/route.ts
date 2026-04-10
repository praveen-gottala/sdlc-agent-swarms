import { NextRequest, NextResponse } from 'next/server';
import { readTextFile } from '../_lib/project-reader';

interface EventEntry {
  type?: string;
  runId?: string;
  taskId?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/**
 * GET /api/events?runId=xxx&since=<timestamp>
 * GET /api/events?taskId=xxx&since=<timestamp>
 *
 * Reads `.agentforge/events.jsonl`, filters by runId or taskId + timestamp,
 * returns matching events. Used by the Design Studio logs panel for live polling.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get('runId');
  const taskId = searchParams.get('taskId');
  const sinceStr = searchParams.get('since');
  const since = sinceStr ? Number(sinceStr) : 0;

  if (!runId && !taskId) {
    return NextResponse.json(
      { error: 'Either runId or taskId query parameter is required' },
      { status: 400 },
    );
  }

  const raw = readTextFile('.agentforge/events.jsonl');
  if (!raw) {
    return NextResponse.json({ events: [] });
  }

  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const events: EventEntry[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as EventEntry;

      // Filter by runId or taskId
      if (runId && event.runId !== runId) continue;
      if (taskId && event.taskId !== taskId) continue;

      // Filter by timestamp
      if (since && event.timestamp && event.timestamp <= since) continue;

      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return NextResponse.json({ events });
}
