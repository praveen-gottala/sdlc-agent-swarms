'use client';

import Link from 'next/link';

type PhaseStatus = 'pending' | 'active' | 'complete';

interface PhaseCardProps {
  name: string;
  status: PhaseStatus;
  tasksDone: number;
  tasksTotal: number;
  cost: number;
  icon: string;
}

const statusConfig: Record<PhaseStatus, { dot: string; border: string; label: string }> = {
  complete: {
    dot: 'bg-green-400',
    border: 'border-green-500/30',
    label: 'Complete',
  },
  active: {
    dot: 'bg-orange-400',
    border: 'border-orange-500/50 shadow-[0_0_15px_rgba(251,146,60,0.15)]',
    label: 'Active',
  },
  pending: {
    dot: 'bg-gray-500',
    border: 'border-[#2d2f42]',
    label: 'Pending',
  },
};

export function PhaseCard({ name, status, tasksDone, tasksTotal, cost, icon }: PhaseCardProps) {
  const config = statusConfig[status];
  const progress = tasksTotal > 0 ? (tasksDone / tasksTotal) * 100 : 0;
  const phaseSlug = name.toLowerCase().replace(/\s+/g, '-');

  return (
    <Link
      href={`/tasks?phase=${phaseSlug}`}
      className={`group block rounded-xl bg-[#1a1b2e] border ${config.border} p-5 transition-all hover:border-[#4a4d6a] hover:bg-[#1e1f34] ${
        status === 'active' ? 'animate-pulse-glow' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" role="img" aria-label={name}>
            {icon}
          </span>
          <h3 className="text-base font-semibold text-[#e2e8f0]">{name}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${config.dot} ${
            status === 'active' ? 'animate-pulse' : ''
          }`} />
          <span className="text-xs text-[#94a3b8]">{config.label}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-[#94a3b8]">
          <span className="font-medium text-[#e2e8f0]">{tasksDone}</span>/{tasksTotal} tasks
        </span>
        <span className="text-[#94a3b8]">
          ${cost.toFixed(2)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#2d2f42]">
        <div
          className={`h-full rounded-full transition-all ${
            status === 'complete'
              ? 'bg-green-400'
              : status === 'active'
                ? 'bg-orange-400'
                : 'bg-gray-600'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </Link>
  );
}
