'use client';

/** Props for a budget card with progress bar. */
export interface BudgetCardProps {
  /** Budget label (e.g. "Monthly Budget"). */
  label: string;
  /** Amount spent in dollars. */
  spent: number;
  /** Budget limit in dollars. */
  limit: number;
  /** Warning threshold as a fraction (default 0.8). */
  threshold?: number;
}

/** Budget card showing spend vs limit with a color-coded progress bar. */
export function BudgetCard({ label, spent, limit, threshold = 0.8 }: BudgetCardProps) {
  const ratio = limit > 0 ? spent / limit : 0;
  const pct = Math.min(ratio * 100, 100);

  let barColor: string;
  if (ratio > threshold) {
    barColor = 'bg-accent-red';
  } else if (ratio > 0.5) {
    barColor = 'bg-accent-yellow';
  } else {
    barColor = 'bg-accent-green';
  }

  return (
    <div className="flex-1 rounded-lg bg-bg-card border border-border px-5 py-4">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-text-primary mt-1">
        ${spent.toFixed(2)}{' '}
        <span className="text-sm font-normal text-text-muted">/ ${limit.toFixed(2)}</span>
      </p>
      {/* Progress bar */}
      <div className="mt-3 h-2 rounded-full bg-bg-elevated overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-text-muted mt-1 text-right">{pct.toFixed(1)}%</p>
    </div>
  );
}
