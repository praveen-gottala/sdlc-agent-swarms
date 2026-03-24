'use client';

/** A single phase cost entry. */
export interface PhaseCost {
  /** Phase name. */
  phase: string;
  /** Cost in dollars. */
  cost: number;
  /** Bar color (hex). */
  color: string;
}

/** Props for the cost-by-phase horizontal bar chart. */
export interface CostByPhaseProps {
  /** Array of phase cost entries. */
  phases: PhaseCost[];
}

/** Horizontal bar chart showing cost breakdown by SDLC phase. */
export function CostByPhase({ phases }: CostByPhaseProps) {
  const maxCost = Math.max(...phases.map((p) => p.cost), 1);

  return (
    <div className="rounded-lg bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Cost by Phase</h3>
      <div className="flex flex-col gap-3">
        {phases.map((p) => {
          const widthPct = (p.cost / maxCost) * 100;
          return (
            <div key={p.phase} className="flex items-center gap-3">
              <span className="text-sm text-text-secondary w-24 flex-shrink-0 truncate">
                {p.phase}
              </span>
              <div className="flex-1 h-6 rounded bg-bg-elevated overflow-hidden relative">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{ width: `${widthPct}%`, backgroundColor: p.color }}
                />
              </div>
              <span className="text-sm font-mono text-text-primary w-16 text-right flex-shrink-0">
                ${p.cost.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
