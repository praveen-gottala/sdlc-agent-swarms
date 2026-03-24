import { NextResponse } from 'next/server';
import { readTextFile } from '../../_lib/project-reader';

interface EventEntry {
  type?: string;
  taskId?: string;
  pageId?: string;
  timestamp?: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * GET /api/traces/[taskId]
 * Returns execution trace data for a given task, constructed from .agentforge/events.jsonl.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await params;

  const raw = readTextFile('.agentforge/events.jsonl');
  const lines = (raw ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  const events: EventEntry[] = [];
  for (const lineStr of lines) {
    try {
      const event = JSON.parse(lineStr) as EventEntry;
      if (event.taskId === taskId) {
        events.push(event);
      }
    } catch {
      // Skip malformed lines
    }
  }

  if (events.length === 0) {
    return NextResponse.json({
      trace: {
        taskId,
        agent: '',
        startedAt: null,
        completedAt: null,
        durationMs: null,
        status: 'not_found',
        steps: [],
        totalCost: 0,
        totalTokens: { input: 0, output: 0 },
      },
    });
  }

  const steps = events.map((event, idx) => {
    const ts = event.timestamp
      ? new Date(event.timestamp * 1000).toISOString()
      : new Date().toISOString();
    return {
      stepId: `step-${idx + 1}`,
      action: event.type ?? 'unknown',
      input: Object.fromEntries(
        Object.entries(event).filter(
          ([k]) => !['type', 'taskId', 'timestamp', 'source'].includes(k),
        ),
      ),
      output: null,
      startedAt: ts,
      durationMs: null,
      tokenUsage: { input: 0, output: 0 },
      cost: 0,
    };
  });

  const firstTs = events[0]?.timestamp
    ? new Date(events[0].timestamp * 1000).toISOString()
    : null;
  const lastTs =
    events.length > 1 && events[events.length - 1]?.timestamp
      ? new Date(events[events.length - 1].timestamp! * 1000).toISOString()
      : null;

  const durationMs =
    events.length > 1 &&
    events[0]?.timestamp &&
    events[events.length - 1]?.timestamp
      ? Math.round(
          (events[events.length - 1].timestamp! - events[0].timestamp!) * 1000,
        )
      : null;

  const trace = {
    taskId,
    agent: events[0]?.source ?? '',
    startedAt: firstTs,
    completedAt: lastTs,
    durationMs,
    status: 'complete',
    steps,
    totalCost: 0,
    totalTokens: { input: 0, output: 0 },
  };

  return NextResponse.json({ trace });
}
