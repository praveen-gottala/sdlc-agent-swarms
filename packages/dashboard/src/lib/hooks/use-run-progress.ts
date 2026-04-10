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
  progress: { current: number; total: number; label: string } | null;
  agentRole: string | null;
  cost: { totalCostUsd: number; tokensUsed: number } | null;
  error: string | null;
  startedAt: string | null;
  stageTimings: Record<string, StageTiming> | null;
}

const POLL_INTERVAL_MS = 2_000;

/**
 * Polls GET /api/runs/<runId> every 2s while status is "running" or "pending".
 * Stops polling once the run completes or fails.
 */
export function useRunProgress(runId: string | null): RunProgressState {
  const [state, setState] = useState<RunProgressState>({
    status: null,
    stage: null,
    stageDescription: null,
    progress: null,
    agentRole: null,
    cost: null,
    error: null,
    startedAt: null,
    stageTimings: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!runId) {
      setState({
        status: null, stage: null, stageDescription: null, progress: null,
        agentRole: null, cost: null, error: null, startedAt: null, stageTimings: null,
      });
      return;
    }

    let active = true;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok || !active) return;

        const data = await res.json();
        if (!active) return;

        setState({
          status: data.status,
          stage: data.stage,
          stageDescription: data.stageDescription ?? null,
          progress: data.progress,
          agentRole: data.agentRole,
          cost: data.cost,
          error: data.error,
          startedAt: data.startedAt ?? null,
          stageTimings: data.stageTimings ?? null,
        });

        // Stop polling when done
        if (data.status === 'complete' || data.status === 'failed') {
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

  return state;
}
