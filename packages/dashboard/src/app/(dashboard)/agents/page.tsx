'use client';

import React, { useState, useEffect } from 'react';
import { AgentLearnings } from '@/components/agents/agent-learnings';
import { SpineStageCard, type StageStatus } from '@/components/agents/spine-stage-card';
import { SPINE_STAGES } from '@/components/spine/spine-constants';
import { SpineRail } from '@/components/spine/spine-rail';

interface StageStats {
  runsCompleted: number;
  avgDurationMs: number;
  totalCostUsd: number;
  status: StageStatus;
}

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

  const activeStageIdx = SPINE_STAGES.findIndex((s) => stats[s.key]?.status === 'running');

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;
  }

  return (
    <main className="px-6 py-10">
      <div className="mx-auto max-w-5xl">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Pipeline</h1>
          <p className="mt-1 text-sm text-text-muted">
            Your idea flows through four stages — each one bringing it closer to production
          </p>
        </div>

        {/* Mini SpineRail showing the flow */}
        <div className="mb-8 py-4">
          <SpineRail activeStage={activeStageIdx} variant="compact" />
        </div>

        {/* Stage cards — 2x2 grid */}
        <section className="mb-12">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {SPINE_STAGES.map((stage, i) => {
              const s = stats[stage.key] ?? { runsCompleted: 0, avgDurationMs: 0, totalCostUsd: 0, status: 'idle' as const };
              return (
                <SpineStageCard
                  key={stage.key}
                  stageKey={stage.key}
                  stageNumber={i + 1}
                  name={stage.label}
                  description={stage.description}
                  icon={stage.icon}
                  color={stage.color}
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
