import { NextResponse } from 'next/server';
import { readTextFile } from '../../_lib/project-reader';

interface LLMMeta {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

interface EventEntry {
  type?: string;
  taskId?: string;
  pageId?: string;
  timestamp?: number;
  source?: string;
  stage?: string;
  agentRole?: string;
  detail?: string;
  status?: string;
  cost?: { totalCostUsd?: number; tokensUsed?: number };
  llmMeta?: LLMMeta;
  [key: string]: unknown;
}

/** Normalize a timestamp that may be in seconds or milliseconds to ms. */
function toMs(ts: number): number {
  return ts < 1e12 ? ts * 1000 : ts;
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

  // Build a map of started timestamps per stage for duration calculation
  const stageStartTimes = new Map<string, number>();
  for (const event of events) {
    if (event.status === 'started' && event.stage && event.timestamp) {
      stageStartTimes.set(event.stage, toMs(event.timestamp));
    }
  }

  // Accumulate totals
  let sumCost = 0;
  let sumInputTokens = 0;
  let sumOutputTokens = 0;

  const steps = events.map((event, idx) => {
    const ts = event.timestamp
      ? new Date(toMs(event.timestamp)).toISOString()
      : new Date().toISOString();

    // Extract token usage from llmMeta or fallback to zero
    const inputTokens = event.llmMeta?.inputTokens ?? 0;
    const outputTokens = event.llmMeta?.outputTokens ?? 0;

    // Extract cost from event
    const stepCost = event.cost?.totalCostUsd ?? 0;

    // Compute duration: use llmMeta.durationMs for LLM call events,
    // or compute from started/completed pairs for stage events
    let stepDurationMs: number | null = event.llmMeta?.durationMs ?? null;
    if (stepDurationMs === null && event.status === 'completed' && event.stage && event.timestamp) {
      const startTime = stageStartTimes.get(event.stage);
      if (startTime) {
        stepDurationMs = Math.round(toMs(event.timestamp) - startTime);
      }
    }

    // Accumulate totals
    sumCost += stepCost;
    sumInputTokens += inputTokens;
    sumOutputTokens += outputTokens;

    // Use detail > stage > type for better readability in the timeline
    const action = event.detail ?? event.stage ?? event.type ?? 'unknown';

    return {
      stepId: `step-${idx + 1}`,
      action,
      stage: event.stage,
      agentRole: event.agentRole,
      detail: event.detail,
      status: event.status,
      input: Object.fromEntries(
        Object.entries(event).filter(
          ([k]) => !['type', 'taskId', 'timestamp', 'source', 'stage', 'agentRole', 'detail', 'status', 'cost', 'llmMeta'].includes(k),
        ),
      ),
      output: null,
      startedAt: ts,
      durationMs: stepDurationMs,
      tokenUsage: { input: inputTokens, output: outputTokens },
      cost: stepCost,
      llmMeta: event.llmMeta ?? null,
    };
  });

  const firstTs = events[0]?.timestamp
    ? new Date(toMs(events[0].timestamp)).toISOString()
    : null;
  const lastTs =
    events.length > 1 && events[events.length - 1]?.timestamp
      ? new Date(toMs(events[events.length - 1].timestamp!)).toISOString()
      : null;

  const durationMs =
    events.length > 1 &&
    events[0]?.timestamp &&
    events[events.length - 1]?.timestamp
      ? Math.round(
          toMs(events[events.length - 1].timestamp!) - toMs(events[0].timestamp!),
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
    totalCost: sumCost,
    totalTokens: { input: sumInputTokens, output: sumOutputTokens },
  };

  return NextResponse.json({ trace });
}
