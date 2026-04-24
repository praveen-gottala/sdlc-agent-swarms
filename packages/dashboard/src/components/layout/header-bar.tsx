'use client';

import { useEffect, useState } from 'react';

export interface HeaderBarProps {
  /** Page title shown on the left. */
  title: string;
  /** Current SDLC phase label. */
  phase?: string;
  /** Budget spent so far in dollars. */
  budgetUsed?: number;
  /** Total budget cap in dollars. */
  budgetTotal?: number;
  /** Number of currently active agents. */
  activeAgents?: number;
}

/** Top header bar displaying page context, phase, budget, and clock. */
export function HeaderBar({
  title,
  phase = 'Code Gen Phase',
  budgetUsed = 27.5,
  budgetTotal = 200,
  activeAgents = 4,
}: HeaderBarProps) {
  const fmt = () =>
    new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  const [clock, setClock] = useState(fmt);

  useEffect(() => {
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const budgetPct = budgetTotal > 0 ? (budgetUsed / budgetTotal) * 100 : 0;

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-sidebar border-b border-border">
      {/* Left: title */}
      <h1 className="text-text-primary font-semibold text-lg">{title}</h1>

      {/* Right cluster */}
      <div className="flex items-center gap-6">
        {/* Phase badge */}
        <span className="bg-accent-purple/20 text-accent-purple text-xs font-medium px-3 py-1 rounded-full">
          {phase}
        </span>

        {/* Budget summary */}
        <div className="flex items-center gap-2">
          <span className="text-text-secondary text-xs">
            ${budgetUsed.toFixed(2)} / ${budgetTotal.toFixed(0)}
          </span>
          <div className="w-20 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                budgetPct > 80
                  ? 'bg-accent-red'
                  : budgetPct > 50
                    ? 'bg-accent-yellow'
                    : 'bg-accent-green'
              }`}
              style={{ width: `${Math.min(budgetPct, 100)}%` }}
            />
          </div>
        </div>

        {/* Active agents */}
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green" />
          </span>
          <span className="text-text-secondary text-xs">
            {activeAgents} agent{activeAgents !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Clock */}
        <span className="text-text-muted text-xs font-mono tabular-nums min-w-[60px] text-right">
          {clock}
        </span>
      </div>
    </header>
  );
}
