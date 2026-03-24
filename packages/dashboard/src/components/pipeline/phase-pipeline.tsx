'use client';

import { PhaseCard } from './phase-card';

type PhaseStatus = 'pending' | 'active' | 'complete';

interface Phase {
  name: string;
  icon: string;
  status: PhaseStatus;
  tasksDone: number;
  tasksTotal: number;
  cost: number;
}

interface PhasePipelineProps {
  phases: Phase[];
}

function Connector({ completed }: { completed: boolean }) {
  return (
    <div className="hidden items-center lg:flex" aria-hidden="true">
      <div
        className={`h-0.5 w-8 ${
          completed ? 'bg-green-400/60' : 'bg-[#2d2f42]'
        }`}
      />
      <div
        className={`h-0 w-0 border-y-[5px] border-l-[6px] border-y-transparent ${
          completed ? 'border-l-green-400/60' : 'border-l-[#2d2f42]'
        }`}
      />
    </div>
  );
}

export function PhasePipeline({ phases }: PhasePipelineProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 lg:flex-nowrap lg:gap-0">
      {phases.map((phase, index) => (
        <div key={phase.name} className="flex items-center">
          <div className="w-52">
            <PhaseCard
              name={phase.name}
              icon={phase.icon}
              status={phase.status}
              tasksDone={phase.tasksDone}
              tasksTotal={phase.tasksTotal}
              cost={phase.cost}
            />
          </div>
          {index < phases.length - 1 && (
            <Connector completed={phase.status === 'complete'} />
          )}
        </div>
      ))}
    </div>
  );
}
