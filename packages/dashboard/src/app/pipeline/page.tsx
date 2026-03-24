'use client';

import { useState, useEffect } from 'react';
import { PhasePipeline } from '@/components/pipeline/phase-pipeline';
import { SummaryStats } from '@/components/pipeline/summary-stats';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pipeline')
      .then(res => res.json())
      .then(json => {
        const enriched = (json.phases ?? []).map((p: Phase) => ({
          ...p,
          icon: PHASE_ICONS[p.name] ?? '',
        }));
        setPhases(enriched);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  const totalTasks = phases.reduce((sum, p) => sum + p.tasksTotal, 0);
  const completedTasks = phases.reduce((sum, p) => sum + p.tasksDone, 0);
  const phaseCost = phases.reduce((sum, p) => sum + p.cost, 0);

  return (
    <main className="min-h-screen bg-[#0f1117] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-[#e2e8f0]">Pipeline</h1>
          <p className="mt-1 text-sm text-[#94a3b8]">
            SDLC phase progression overview
          </p>
        </div>

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
            totalBudget={50.00}
            activeAgents={3}
            avgCompletionMinutes={4}
          />
        </section>
      </div>
    </main>
  );
}
