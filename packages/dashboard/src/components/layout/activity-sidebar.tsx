'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEventFeed, type FeedEvent } from '@/lib/hooks/use-event-feed';

/** HITL level configuration per phase. */
interface HitlPhaseConfig {
  phase: string;
  level: 'full' | 'selective' | 'audit-only';
}

/** Map event type/source to a display icon */
function getEventIcon(event: FeedEvent): string {
  const type = event.type.toLowerCase();
  if (type.includes('approve') || type.includes('complete')) return '\u2705';
  if (type.includes('agent') || type.includes('started')) return '\uD83E\uDD16';
  if (type.includes('governance') || type.includes('trust')) return '\uD83D\uDEE1\uFE0F';
  if (type.includes('budget') || type.includes('cost')) return '\uD83D\uDCB0';
  if (type.includes('pipeline') || type.includes('phase')) return '\uD83D\uDD04';
  if (type.includes('task')) return '\uD83D\uDCCB';
  if (type.includes('trace')) return '\uD83D\uDD0D';
  if (event.severity === 'error') return '\u274C';
  if (event.severity === 'warning') return '\u26A0\uFE0F';
  return '\uD83D\uDD35';
}

/** Format a timestamp as relative time */
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const HITL_CONFIG: HitlPhaseConfig[] = [
  { phase: 'Spec', level: 'full' },
  { phase: 'Code Gen', level: 'selective' },
  { phase: 'Review', level: 'selective' },
  { phase: 'Test', level: 'audit-only' },
  { phase: 'Deploy', level: 'full' },
];

const LEVEL_COLORS: Record<HitlPhaseConfig['level'], string> = {
  full: 'bg-accent-green/20 text-accent-green',
  selective: 'bg-accent-yellow/20 text-accent-yellow',
  'audit-only': 'bg-accent-blue/20 text-accent-blue',
};

export interface ActivitySidebarProps {
  /** Whether the sidebar is open. */
  open: boolean;
  /** Callback to toggle visibility. */
  onToggle: () => void;
}

interface ActiveRunInfo {
  runId: string;
  type: string;
  stage: string | null;
  agentRole: string | null;
  progress: { current: number; total: number; label: string } | null;
}

const PIPELINE_LABELS: Record<string, string> = {
  'init': 'Project Init',
  'design-generate': 'Spec Generation',
  'design-penpot': 'Design Pipeline',
};

/** Right-hand activity feed and HITL config sidebar. */
export function ActivitySidebar({ open, onToggle }: ActivitySidebarProps) {
  const { events, refresh: refreshEvents } = useEventFeed();
  const [activeRuns, setActiveRuns] = useState<ActiveRunInfo[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch active runs
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs?limit=5');
      if (!res.ok) return;
      const data = await res.json();
      const running = (data.runs ?? []).filter(
        (r: ActiveRunInfo & { status: string }) => r.status === 'running' || r.status === 'pending',
      );
      setActiveRuns(running);
    } catch {
      // Ignore
    }
  }, []);

  // Fetch once on mount (no polling). Using an IIFE with await to ensure
  // setState happens asynchronously after the fetch resolves.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/runs?limit=5');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        const running = (data.runs ?? []).filter(
          (r: ActiveRunInfo & { status: string }) => r.status === 'running' || r.status === 'pending',
        );
        setActiveRuns(running);
      } catch {
        // Ignore
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRuns(), refreshEvents()]);
    setRefreshing(false);
  };

  return (
    <div className="relative flex">
      {/* Toggle button (always visible) */}
      <button
        onClick={onToggle}
        className="absolute -left-6 top-4 z-10 w-6 h-8 flex items-center justify-center bg-sidebar border border-border border-r-0 rounded-l text-text-muted hover:text-text-primary transition-colors"
        aria-label={open ? 'Close activity sidebar' : 'Open activity sidebar'}
      >
        <span className="text-[10px]">{open ? '\u{25B6}' : '\u{25C0}'}</span>
      </button>

      {open && (
        <aside className="w-[280px] h-full bg-sidebar border-l border-border flex flex-col overflow-hidden">
          {/* Running pipelines */}
          {activeRuns.length > 0 && (
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-text-primary text-sm font-semibold mb-2">
                Running Pipelines
              </h2>
              <div className="flex flex-col gap-2">
                {activeRuns.map((run) => (
                  <div key={run.runId} className="bg-bg-elevated/50 rounded-md p-2.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-text-primary text-xs font-medium">
                        {PIPELINE_LABELS[run.type] ?? run.type}
                      </span>
                      <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                    </div>
                    {run.progress && (
                      <div className="mb-1.5">
                        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-blue rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((run.progress.current / run.progress.total) * 100)}%` }}
                          />
                        </div>
                        <p className="text-text-muted text-[10px] mt-0.5">
                          {run.progress.label} ({run.progress.current}/{run.progress.total})
                        </p>
                      </div>
                    )}
                    {run.agentRole && (
                      <p className="text-text-secondary text-[10px]">
                        Agent: {run.agentRole}
                      </p>
                    )}
                    {run.stage && (
                      <p className="text-text-muted text-[10px]">
                        Stage: {run.stage}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event feed */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h2 className="text-text-primary text-sm font-semibold">
                Activity
              </h2>
              <button
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="text-text-muted hover:text-text-primary text-xs transition-colors disabled:opacity-40"
                title="Refresh activity feed"
              >
                {refreshing ? '\u23F3' : '\u21BB'}
              </button>
            </div>
            {events.length === 0 ? (
              <p className="text-text-muted text-xs px-4 py-6 text-center">
                No recent activity
              </p>
            ) : (
              <ul className="flex flex-col">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-start gap-2.5 px-4 py-2.5 border-b border-border/50 hover:bg-bg-elevated/30 transition-colors"
                  >
                    <span className="text-sm flex-shrink-0 mt-0.5">
                      {getEventIcon(event)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-text-secondary text-xs leading-relaxed">
                        {event.message}
                      </p>
                      <p className="text-text-muted text-[10px] mt-0.5">
                        {formatRelativeTime(event.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* HITL config summary */}
          <div className="border-t border-border px-4 py-3">
            <h3 className="text-text-primary text-xs font-semibold mb-2">
              HITL Configuration
            </h3>
            <div className="flex flex-col gap-1.5">
              {HITL_CONFIG.map((cfg) => (
                <div
                  key={cfg.phase}
                  className="flex items-center justify-between"
                >
                  <span className="text-text-muted text-[11px]">
                    {cfg.phase}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${LEVEL_COLORS[cfg.level]}`}
                  >
                    {cfg.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
