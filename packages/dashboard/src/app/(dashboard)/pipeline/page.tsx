'use client';

import { useState, useEffect } from 'react';
import { PhasePipeline } from '@/components/pipeline/phase-pipeline';
import { SummaryStats } from '@/components/pipeline/summary-stats';
import { CreatePageModal } from '@/components/pages/create-page-modal';

interface Phase {
  name: string;
  icon: string;
  status: 'complete' | 'active' | 'pending';
  tasksDone: number;
  tasksTotal: number;
  cost: number;
}

const PHASE_ICONS: Record<string, string> = {
  'Design': '\uD83C\uDFA8',
  'Spec': '\uD83D\uDCCB',
  'Code Gen': '\u26A1',
  'CI/CD': '\uD83D\uDD04',
  'Observe': '\uD83D\uDC41\uFE0F',
};

export default function PipelinePage() {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [totalBudget, setTotalBudget] = useState<number | null>(null);
  const [activeAgents, setActiveAgents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreatePage, setShowCreatePage] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/pipeline').then(res => res.json()).catch(() => ({ phases: [] })),
      fetch('/api/projects/active').then(res => res.ok ? res.json() : null).catch(() => null),
      fetch('/api/agents').then(res => res.json()).catch(() => ({ agents: [] })),
    ]).then(([pipelineJson, projectJson, agentsJson]) => {
      const enriched = (pipelineJson.phases ?? []).map((p: Phase) => ({
        ...p,
        icon: PHASE_ICONS[p.name] ?? '',
      }));
      setPhases(enriched);

      // Budget from project config (monthly_max_usd) — show null if unavailable
      if (projectJson && !projectJson.error) {
        // The /api/costs route reads budget; fetch it for the monthly budget
        fetch('/api/costs')
          .then(r => r.json())
          .then(costsJson => {
            const budget = costsJson?.costs?.monthly?.budget;
            setTotalBudget(typeof budget === 'number' ? budget : null);
          })
          .catch(() => setTotalBudget(null));
      }

      // Active agents = agents with status 'active'
      const agents = agentsJson.agents ?? [];
      const active = agents.filter((a: Record<string, unknown>) => a.status === 'active');
      setActiveAgents(active.length);

      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  const totalTasks = phases.reduce((sum, p) => sum + p.tasksTotal, 0);
  const completedTasks = phases.reduce((sum, p) => sum + p.tasksDone, 0);
  const phaseCost = phases.reduce((sum, p) => sum + p.cost, 0);

  return (
    <main className="min-h-screen bg-[#0f1117] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e2e8f0]">Pipeline</h1>
            <p className="mt-1 text-sm text-[#94a3b8]">
              SDLC phase progression overview
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreatePage(true)}
            className="rounded-md bg-accent-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-blue/80"
          >
            + New Page
          </button>
        </div>

        <CreatePageModal open={showCreatePage} onClose={() => setShowCreatePage(false)} />

        {/* Phase pipeline */}
        <section className="mb-12">
          <PhasePipeline phases={phases} />
        </section>

        {/* Summary statistics */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-[#e2e8f0]">Summary</h2>
          <SummaryStats
            totalTasks={totalTasks}
            completedTasks={completedTasks}
            phaseCost={phaseCost}
            totalBudget={totalBudget}
            activeAgents={activeAgents}
            avgCompletionMinutes={4}
          />
        </section>
      </div>
    </main>
  );
}
