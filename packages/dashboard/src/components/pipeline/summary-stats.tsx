'use client';

interface StatCardProps {
  label: string;
  value: string;
  trend: number;
  trendLabel: string;
}

function TrendIndicator({ trend }: { trend: number }) {
  const isPositive = trend >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        isPositive ? 'text-green-400' : 'text-red-400'
      }`}
    >
      <span>{isPositive ? '\u2191' : '\u2193'}</span>
      <span>{Math.abs(trend)}%</span>
    </span>
  );
}

function StatCard({ label, value, trend, trendLabel }: StatCardProps) {
  return (
    <div className="rounded-xl bg-[#1a1b2e] border border-[#2d2f42] p-5">
      <p className="text-sm text-[#94a3b8]">{label}</p>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-bold text-[#e2e8f0]">{value}</span>
        <TrendIndicator trend={trend} />
      </div>
      <p className="mt-1 text-xs text-[#94a3b8]">{trendLabel}</p>
    </div>
  );
}

interface SummaryStatsProps {
  totalTasks: number;
  completedTasks: number;
  phaseCost: number;
  totalBudget: number | null;
  activeAgents: number | null;
  avgCompletionMinutes: number;
}

export function SummaryStats({
  totalTasks,
  completedTasks,
  phaseCost,
  totalBudget,
  activeAgents,
  avgCompletionMinutes,
}: SummaryStatsProps) {
  const budgetLabel = totalBudget != null
    ? `of $${totalBudget.toFixed(2)} budget`
    : 'budget unavailable';

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Tasks"
        value={`${completedTasks}/${totalTasks}`}
        trend={12}
        trendLabel="vs last run"
      />
      <StatCard
        label="Phase Cost"
        value={`$${phaseCost.toFixed(2)}`}
        trend={-8}
        trendLabel={budgetLabel}
      />
      <div className="rounded-xl bg-[#1a1b2e] border border-[#2d2f42] p-5">
        <p className="text-sm text-[#94a3b8]">Active Agents</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-2xl font-bold text-[#e2e8f0]">{activeAgents != null ? activeAgents : '\u2014'}</span>
          {activeAgents != null && activeAgents > 0 && (
            <span className="mb-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-orange-400" />
          )}
        </div>
        <p className="mt-1 text-xs text-[#94a3b8]">currently running</p>
      </div>
      <StatCard
        label="Avg Completion"
        value={`${avgCompletionMinutes}m`}
        trend={5}
        trendLabel="per task"
      />
    </div>
  );
}
