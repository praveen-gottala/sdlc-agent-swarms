'use client';

/** A single agent cost entry. */
export interface AgentCost {
  /** Agent name. */
  agent: string;
  /** Total cost in dollars. */
  totalCost: number;
  /** Number of tasks executed. */
  taskCount: number;
  /** Agent color (hex). */
  color: string;
}

/** Props for the cost-by-agent table. */
export interface CostByAgentProps {
  /** Array of agent cost entries, sorted by highest spend. */
  agents: AgentCost[];
}

/** List showing cost breakdown by agent with horizontal bar visualization. */
export function CostByAgent({ agents }: CostByAgentProps) {
  const maxCost = Math.max(...agents.map((a) => a.totalCost), 1);

  return (
    <div className="rounded-lg bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Cost by Agent</h3>
      {/* Header */}
      <div className="flex items-center gap-3 px-2 pb-2 border-b border-border text-xs text-text-muted uppercase tracking-wide">
        <span className="w-28 flex-shrink-0">Agent</span>
        <span className="flex-1">Spend</span>
        <span className="w-16 text-right">Total</span>
        <span className="w-14 text-right">Tasks</span>
        <span className="w-20 text-right">Avg/Task</span>
      </div>
      {/* Rows */}
      <div className="divide-y divide-border">
        {agents.map((a) => {
          const widthPct = (a.totalCost / maxCost) * 100;
          const avg = a.taskCount > 0 ? a.totalCost / a.taskCount : 0;
          return (
            <div key={a.agent} className="flex items-center gap-3 px-2 py-3">
              <div className="w-28 flex-shrink-0 flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: a.color }}
                />
                <span className="text-sm text-text-primary truncate">{a.agent}</span>
              </div>
              <div className="flex-1 h-4 rounded bg-bg-elevated overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{ width: `${widthPct}%`, backgroundColor: a.color }}
                />
              </div>
              <span className="w-16 text-right text-sm font-mono text-text-primary">
                ${a.totalCost.toFixed(2)}
              </span>
              <span className="w-14 text-right text-sm text-text-secondary">
                {a.taskCount}
              </span>
              <span className="w-20 text-right text-sm font-mono text-text-muted">
                ${avg.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
