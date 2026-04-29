'use client';

interface StatusBarProps {
  round: number;
  maxRounds: number;
  questionCount: number;
  assumptionCount: number;
  isRunning: boolean;
}

export function StatusBar({ round, maxRounds, questionCount, assumptionCount, isRunning }: StatusBarProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-bg-card px-4 py-2">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Round</span>
        <span className="text-sm font-semibold text-text-primary">
          {round}/{maxRounds}
        </span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Questions</span>
        <span className="text-sm font-semibold text-accent-blue">{questionCount}</span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Assumptions</span>
        <span className="text-sm font-semibold text-orange-400">{assumptionCount}</span>
      </div>
      {isRunning && (
        <>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-blue opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-blue" />
            </span>
            <span className="text-xs font-medium text-accent-blue">Processing</span>
          </div>
        </>
      )}
    </div>
  );
}
