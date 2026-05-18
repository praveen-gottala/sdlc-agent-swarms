'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface StageTiming {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface RunProgressState {
  status: 'pending' | 'running' | 'complete' | 'failed' | null;
  stage: string | null;
  stageDescription: string | null;
  subStage: string | null;
  progress: { current: number; total: number; label: string } | null;
  agentRole: string | null;
  cost: { totalCostUsd: number; tokensUsed: number } | null;
  error: string | null;
  startedAt: string | null;
  stageTimings: Record<string, StageTiming> | null;
  estimatedRemainingMs: number | null;
}

const POLL_INTERVAL_MS = 2_000;

const INITIAL_STATE: RunProgressState = {
  status: null,
  stage: null,
  stageDescription: null,
  subStage: null,
  progress: null,
  agentRole: null,
  cost: null,
  error: null,
  startedAt: null,
  stageTimings: null,
  estimatedRemainingMs: null,
};

const HISTORY_KEY = 'chip-run-durations';

function loadHistoricalDurations(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) return JSON.parse(stored) as number[];
  } catch { /* ignore */ }
  return [];
}

function storeRunDuration(durationMs: number): void {
  if (typeof window === 'undefined') return;
  const history = loadHistoricalDurations();
  history.push(durationMs);
  const trimmed = history.slice(-10);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

function parseSubStage(description: string | null): string | null {
  if (!description) return null;
  const colonIdx = description.indexOf(':');
  if (colonIdx > 0 && colonIdx < 30) return description.substring(0, colonIdx).trim();
  return null;
}

/**
 * Polls GET /api/runs/<runId> every 2s while status is "running" or "pending".
 * Stops polling once the run completes or fails.
 */
export function useRunProgress(runId: string | null): RunProgressState {
  const [state, setState] = useState<RunProgressState>(INITIAL_STATE);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!runId) {
      return;
    }

    let active = true;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok || !active) return;

        const data = await res.json();
        if (!active) return;

        const elapsedMs = data.startedAt
          ? Date.now() - new Date(data.startedAt).getTime()
          : 0;
        const history = loadHistoricalDurations();
        const avgDuration = history.length > 0
          ? history.reduce((a, b) => a + b, 0) / history.length
          : null;
        const estimatedRemainingMs = avgDuration !== null && data.status === 'running'
          ? Math.max(0, avgDuration - elapsedMs)
          : null;

        setState({
          status: data.status,
          stage: data.stage,
          stageDescription: data.stageDescription ?? null,
          subStage: parseSubStage(data.stageDescription ?? null),
          progress: data.progress,
          agentRole: data.agentRole,
          cost: data.cost,
          error: data.error,
          startedAt: data.startedAt ?? null,
          stageTimings: data.stageTimings ?? null,
          estimatedRemainingMs,
        });

        if (data.status === 'complete' || data.status === 'failed') {
          if (data.status === 'complete' && data.startedAt) {
            storeRunDuration(Date.now() - new Date(data.startedAt).getTime());
          }
          stopPolling();
        }
      } catch {
        // Silently ignore fetch errors
      }
    }

    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      active = false;
      stopPolling();
    };
  }, [runId, stopPolling]);

  // When runId is null, return the initial (reset) state
  if (!runId) return INITIAL_STATE;

  return state;
}
