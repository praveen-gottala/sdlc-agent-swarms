'use client';

import { useState, useEffect } from 'react';
import { ExecutionSummary } from '../../components/traces/execution-summary';
import { TraceTimeline } from '../../components/traces/trace-timeline';
import type { TraceTimelineStep } from '../../components/traces/trace-timeline';

/** A single trace entry in the left panel list. */
interface TraceEntry {
  id: string;
  task: string;
  agent: string;
  agentColor: string;
  timestamp: string;
  status: 'pass' | 'fail' | 'pending';
  duration: string;
  totalTokens: number;
  cost: number;
  attemptCount: number;
  filesChanged: number;
  steps: TraceTimelineStep[];
}

const STATUS_INDICATOR: Record<string, string> = {
  pass: 'bg-accent-green',
  fail: 'bg-accent-red',
  pending: 'bg-accent-yellow',
};

const AGENT_COLORS: Record<string, string> = {
  'code-gen': '#3b82f6',
  'ux-designer': '#a855f7',
  'spec-writer': '#14b8a6',
  'devops': '#f97316',
  'observer': '#06b6d4',
  'custom-qa': '#64748b',
};

/** Known task IDs to fetch traces for. */
const TASK_IDS = ['task-001', 'task-002', 'task-003', 'task-005', 'task-006'];

/** Map API trace to display format. */
function mapTrace(apiTrace: Record<string, unknown>): TraceEntry {
  const taskId = apiTrace.taskId as string;
  const agent = apiTrace.agent as string;
  const status = apiTrace.status as string;
  const steps = (apiTrace.steps as Record<string, unknown>[]) ?? [];
  const totalTokens = apiTrace.totalTokens as { input: number; output: number } | undefined;
  const totalCost = (apiTrace.totalCost as number) ?? 0;

  const mappedSteps: TraceTimelineStep[] = steps.map((s) => ({
    label: s.action as string,
    status: s.durationMs !== null ? 'pass' : 'pending',
    timestamp: s.startedAt ? new Date(s.startedAt as string).toLocaleTimeString('en-US', { hour12: false }) : null,
    detail: JSON.stringify(s.output ?? s.input ?? {}),
    tokenCount: s.tokenUsage ? ((s.tokenUsage as Record<string, number>).input + (s.tokenUsage as Record<string, number>).output) : undefined,
  }));

  const totalDurationMs = steps.reduce((sum, s) => sum + ((s.durationMs as number) ?? 0), 0);
  const durationStr = totalDurationMs > 60000
    ? `${Math.floor(totalDurationMs / 60000)}m ${Math.floor((totalDurationMs % 60000) / 1000)}s`
    : `${Math.floor(totalDurationMs / 1000)}s`;

  return {
    id: `TRC-${taskId}`,
    task: taskId,
    agent,
    agentColor: AGENT_COLORS[agent] ?? '#64748b',
    timestamp: (apiTrace.startedAt as string) ?? '',
    status: status === 'in_progress' ? 'pending' : status === 'error' ? 'fail' : 'pass',
    duration: durationStr,
    totalTokens: totalTokens ? totalTokens.input + totalTokens.output : 0,
    cost: totalCost,
    attemptCount: 1,
    filesChanged: steps.filter((s) => {
      const output = s.output as Record<string, unknown> | null;
      return output && ('filesGenerated' in output);
    }).length || 1,
    steps: mappedSteps,
  };
}

/** Traces page with trace list on left and selected trace detail on right. */
export default function TracesPage() {
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      TASK_IDS.map(taskId =>
        fetch(`/api/traces/${taskId}`)
          .then(res => res.json())
          .then(json => mapTrace(json.trace ?? json))
          .catch(() => null)
      )
    ).then(results => {
      const valid = results.filter((r): r is TraceEntry => r !== null);
      setTraces(valid);
      if (valid.length > 0) {
        setSelectedId(valid[0].id);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;
  if (traces.length === 0) return <div className="flex items-center justify-center h-64 text-text-muted">No traces found</div>;

  const selected = traces.find((t) => t.id === selectedId) ?? traces[0];

  return (
    <div className="flex flex-col h-full min-h-0 gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Traces</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Agent execution traces and step-by-step timelines
        </p>
      </div>

      {/* Main content: list + detail */}
      <div className="flex gap-5 flex-1 min-h-0">
        {/* Left panel: trace list */}
        <div className="w-[340px] flex-shrink-0 overflow-y-auto rounded-lg bg-bg-card border border-border">
          <div className="p-3 border-b border-border">
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Recent Traces
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {traces.map((trace) => (
              <li key={trace.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(trace.id)}
                  className={`w-full text-left px-4 py-3 transition-colors ${
                    trace.id === selectedId
                      ? 'bg-accent-blue/10 border-l-2 border-accent-blue'
                      : 'hover:bg-bg-elevated/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_INDICATOR[trace.status]}`}
                    />
                    <span className="text-xs font-mono text-text-muted">
                      {trace.id}
                    </span>
                    <span
                      className="ml-auto w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: trace.agentColor }}
                    />
                    <span className="text-xs text-text-muted">{trace.agent}</span>
                  </div>
                  <p className="text-sm text-text-primary mt-1 truncate">
                    {trace.task}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{trace.timestamp}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Right panel: trace detail */}
        <div className="flex-1 min-w-0 overflow-y-auto flex flex-col gap-5">
          <ExecutionSummary
            duration={selected.duration}
            totalTokens={selected.totalTokens}
            cost={selected.cost}
            attemptCount={selected.attemptCount}
            filesChanged={selected.filesChanged}
          />
          <TraceTimeline steps={selected.steps} />
        </div>
      </div>
    </div>
  );
}
