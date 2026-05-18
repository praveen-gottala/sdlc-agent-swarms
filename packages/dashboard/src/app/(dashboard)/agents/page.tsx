'use client';

import React, { useState, useEffect } from 'react';
import { AgentLearnings } from '@/components/agents/agent-learnings';
import { SpineStageCard, type StageStatus } from '@/components/agents/spine-stage-card';
import { SPINE_STAGES } from '@/components/spine/spine-constants';

interface StageStats {
  runsCompleted: number;
  avgDurationMs: number;
  totalCostUsd: number;
  status: StageStatus;
}

const STAGE_MODELS: Record<string, string> = {
  clarifier: 'claude-opus-4-6',
  architect: 'claude-opus-4-6',
  implementer: 'claude-sonnet-4-6',
  reviewer: 'claude-haiku-4-5',
};

export default function AgentsPage(): React.JSX.Element {
  const [stats, setStats] = useState<Record<string, StageStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/runs?limit=50')
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((data: { runs?: Array<{ type: string; status: string; cost?: { totalCostUsd?: number }; stageTimings?: Record<string, { durationMs?: number }> }> }) => {
        const runs = data.runs ?? [];
        const stageMap: Record<string, StageStats> = {};

        for (const stage of SPINE_STAGES) {
          const stageRuns = runs.filter((r) => r.type === stage.key);
          const completed = stageRuns.filter((r) => r.status === 'complete');
          const running = stageRuns.find((r) => r.status === 'running' || r.status === 'pending');
          const failed = stageRuns.find((r) => r.status === 'failed');

          const durations = completed
            .map((r) => {
              const timings = r.stageTimings ?? {};
              const totalMs = Object.values(timings).reduce((sum, t) => sum + (t.durationMs ?? 0), 0);
              return totalMs;
            })
            .filter((d) => d > 0);

          stageMap[stage.key] = {
            runsCompleted: completed.length,
            avgDurationMs: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
            totalCostUsd: completed.reduce((sum, r) => sum + (r.cost?.totalCostUsd ?? 0), 0),
            status: running ? 'running' : failed && completed.length === 0 ? 'failed' : completed.length > 0 ? 'complete' : 'idle',
          };
        }

        setStats(stageMap);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;
  }

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-text-primary">Spine Stages</h1>
          <p className="mt-1 text-sm text-text-muted">
            Four sequential stages that take your idea from requirements to reviewed code
          </p>
        </div>

        {/* Spine stage grid — 2x2 */}
        <section className="mb-12">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {SPINE_STAGES.map((stage) => {
              const s = stats[stage.key] ?? { runsCompleted: 0, avgDurationMs: 0, totalCostUsd: 0, status: 'idle' as const };
              return (
                <SpineStageCard
                  key={stage.key}
                  stageKey={stage.key}
                  name={stage.label}
                  description={stage.description}
                  icon={stage.icon}
                  color={stage.color}
                  model={STAGE_MODELS[stage.key] ?? 'claude-sonnet-4-6'}
                  status={s.status}
                  runsCompleted={s.runsCompleted}
                  avgDurationMs={s.avgDurationMs}
                  totalCostUsd={s.totalCostUsd}
                />
              );
            })}
          </div>
        </section>

        {/* Agent Learnings */}
        <section>
          <AgentLearnings />
        </section>
      </div>
    </main>
  );
}
