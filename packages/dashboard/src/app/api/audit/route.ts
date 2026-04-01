import { NextResponse } from 'next/server';
import { readTextFile } from '../_lib/project-reader';

interface EventEntry {
  type?: string;
  taskId?: string;
  pageId?: string;
  timestamp?: number;
  source?: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * GET /api/audit
 * Returns audit log entries from .agentforge/events.jsonl.
 * Supports query params: search, agent, page, limit.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const agent = searchParams.get('agent');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const limit = parseInt(searchParams.get('limit') ?? '20', 10);

  const raw = readTextFile('.agentforge/events.jsonl');
  const lines = (raw ?? '')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  let entries = lines.map((line, idx) => {
    try {
      const event = JSON.parse(line) as EventEntry;
      const rawTs = event.timestamp ?? 0;
      const ts = rawTs
        ? new Date(rawTs < 1e12 ? rawTs * 1000 : rawTs).toISOString()
        : new Date().toISOString();
      return {
        id: `audit-${String(idx + 1).padStart(3, '0')}`,
        timestamp: ts,
        agent: event.source ?? 'system',
        action: event.type ?? 'unknown',
        resource: event.pageId ?? event.taskId ?? '',
        details: JSON.stringify(event),
        phase: '',
        severity: 'info' as const,
      };
    } catch {
      return null;
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null);

  // Reverse so newest first
  entries.reverse();

  if (search) {
    const q = search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.details.toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.resource.toLowerCase().includes(q),
    );
  }

  if (agent) {
    entries = entries.filter((e) => e.agent === agent);
  }

  const total = entries.length;
  const start = (page - 1) * limit;
  const paginated = entries.slice(start, start + limit);

  return NextResponse.json({
    entries: paginated,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}
