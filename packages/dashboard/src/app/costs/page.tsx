'use client';

import { useState, useEffect } from 'react';
import { BudgetCard } from '../../components/costs/budget-card';
import { CostByPhase } from '../../components/costs/cost-by-phase';
import { CostByAgent } from '../../components/costs/cost-by-agent';
import type { PhaseCost } from '../../components/costs/cost-by-phase';
import type { AgentCost } from '../../components/costs/cost-by-agent';

const PHASE_COLORS: Record<string, string> = {
  'Design': '#a855f7',
  'Spec': '#3b82f6',
  'Code Gen': '#f97316',
  'CI/CD': '#22c55e',
  'Observe': '#06b6d4',
};

const AGENT_COLORS: Record<string, string> = {
  'code-gen': '#3b82f6',
  'ux-designer': '#a855f7',
  'spec-writer': '#14b8a6',
  'design': '#a855f7',
  'cicd': '#f97316',
  'devops': '#f97316',
  'test-runner': '#22c55e',
  'observer': '#06b6d4',
};

interface CostsData {
  monthly: {
    totalCost: number;
    budget: number;
  };
  byPhase: Array<{ phase: string; cost: number; tokenCount: number; taskCount: number }>;
  byAgent: Array<{ agent: string; cost: number; tokenCount: number; taskCount: number; model: string }>;
}

/** Costs dashboard showing budgets, phase costs, and agent costs. */
export default function CostsPage() {
  const [costsData, setCostsData] = useState<CostsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/costs')
      .then(res => res.json())
      .then(json => {
        setCostsData(json.costs ?? json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;
  if (!costsData) return <div className="flex items-center justify-center h-64 text-text-muted">Failed to load cost data</div>;

  const phaseCosts: PhaseCost[] = costsData.byPhase.map(p => ({
    phase: p.phase,
    cost: p.cost,
    color: PHASE_COLORS[p.phase] ?? '#64748b',
  }));

  const agentCosts: AgentCost[] = costsData.byAgent.map(a => ({
    agent: a.agent,
    totalCost: a.cost,
    taskCount: a.taskCount,
    color: AGENT_COLORS[a.agent] ?? '#64748b',
  }));

  const totalSpent = costsData.monthly.totalCost;
  const codeGenCost = costsData.byPhase.find(p => p.phase === 'Code Gen')?.cost ?? 0;
  const maxTaskCost = Math.max(...agentCosts.map(a => a.totalCost / Math.max(a.taskCount, 1)), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-text-primary">Costs</h1>
        <p className="text-sm text-text-muted mt-0.5">
          Budget tracking and cost breakdown across phases and agents
        </p>
      </div>

      {/* Budget cards */}
      <div className="flex gap-4">
        <BudgetCard label="Monthly Budget" spent={totalSpent} limit={costsData.monthly.budget} />
        <BudgetCard label="Phase Budget (Code Gen)" spent={codeGenCost} limit={50.00} />
        <BudgetCard label="Per-Task Limit" spent={maxTaskCost} limit={5.00} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CostByPhase phases={phaseCosts} />
        <CostByAgent agents={agentCosts} />
      </div>
    </div>
  );
}
