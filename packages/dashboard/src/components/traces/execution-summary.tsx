'use client';

/** Props for the execution summary stats bar. */
export interface ExecutionSummaryProps {
  /** Total execution duration string (e.g. "3m 15s"). */
  duration: string;
  /** Total tokens used across all LLM calls. */
  totalTokens: number;
  /** Total cost in dollars. */
  cost: number;
  /** Number of LLM call attempts. */
  attemptCount: number;
  /** Number of files changed in the task. */
  filesChanged: number;
}

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div className="flex-1 rounded-lg bg-bg-card border border-border px-4 py-3 text-center">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-text-primary mt-1">{value}</p>
    </div>
  );
}

/** Stats bar showing key execution metrics for a trace. */
export function ExecutionSummary({
  duration,
  totalTokens,
  cost,
  attemptCount,
  filesChanged,
}: ExecutionSummaryProps) {
  return (
    <div className="flex gap-3">
      <StatBox label="Duration" value={duration} />
      <StatBox label="Total Tokens" value={totalTokens.toLocaleString()} />
      <StatBox label="Cost" value={`$${cost.toFixed(2)}`} />
      <StatBox label="Attempts" value={String(attemptCount)} />
      <StatBox label="Files Changed" value={String(filesChanged)} />
    </div>
  );
}
