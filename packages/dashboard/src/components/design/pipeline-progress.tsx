'use client';

import { useRunProgress } from '@/lib/hooks/use-run-progress';

const STAGES = [
  { name: 'Research', agent: 'ux_research', model: 'claude-sonnet-4-6' },
  { name: 'Planning', agent: 'ux_planning', model: 'claude-sonnet-4-6' },
  { name: 'Design', agent: 'penpot_design', model: 'claude-sonnet-4-6' },
];

interface PipelineProgressProps {
  runId: string | null;
  onComplete?: () => void;
}

export function PipelineProgress({ runId, onComplete }: PipelineProgressProps) {
  const progress = useRunProgress(runId);

  // Determine which stage we're on
  const currentStageIdx = progress.progress?.current ?? 0;
  const isComplete = progress.status === 'complete';
  const isFailed = progress.status === 'failed';

  // Auto-call onComplete
  if (isComplete && onComplete) {
    // Use setTimeout to avoid calling during render
    setTimeout(onComplete, 100);
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <h2 className="text-base font-semibold text-text-primary mb-1">
        {isComplete ? 'Pipeline Complete' : isFailed ? 'Pipeline Failed' : 'Design Pipeline Running'}
      </h2>
      <p className="text-sm text-text-muted mb-8">
        {isComplete
          ? 'All stages completed successfully'
          : isFailed
            ? progress.error ?? 'An error occurred'
            : 'Research, Planning, and Design stages running sequentially'}
      </p>

      {/* Stage progress */}
      <div className="flex items-center gap-0 max-w-xl w-full">
        {STAGES.map((stage, idx) => {
          const isActive = idx === currentStageIdx && progress.status === 'running';
          const isDone = isComplete || idx < currentStageIdx;
          const hasFailed = isFailed && idx === currentStageIdx;

          return (
            <div key={stage.name} className="flex items-center flex-1">
              {/* Stage card */}
              <div
                className={`flex-1 rounded-lg border p-4 transition-all ${
                  isActive
                    ? 'border-accent-blue bg-accent-blue/5 shadow-sm shadow-accent-blue/10'
                    : isDone
                      ? 'border-accent-green/50 bg-accent-green/5'
                      : hasFailed
                        ? 'border-red-400/50 bg-red-400/5'
                        : 'border-border bg-bg-card'
                }`}
              >
                {/* Status indicator */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${
                    isDone
                      ? 'bg-accent-green'
                      : isActive
                        ? 'bg-accent-blue animate-pulse'
                        : hasFailed
                          ? 'bg-red-400'
                          : 'bg-border'
                  }`} />
                  <span className="text-sm font-semibold text-text-primary">{stage.name}</span>
                </div>

                {/* Agent info */}
                <p className="text-[11px] text-text-muted">
                  {stage.agent} · {stage.model}
                </p>

                {/* Status text */}
                <p className={`text-[10px] mt-1.5 font-medium ${
                  isDone
                    ? 'text-accent-green'
                    : isActive
                      ? 'text-accent-blue'
                      : hasFailed
                        ? 'text-red-400'
                        : 'text-text-muted'
                }`}>
                  {isDone ? 'Complete' : isActive ? 'Running...' : hasFailed ? 'Failed' : 'Pending'}
                </p>

                {/* Cost info */}
                {isDone && progress.cost && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    ~${(progress.cost.totalCostUsd / STAGES.length).toFixed(3)}
                  </p>
                )}
              </div>

              {/* Connector */}
              {idx < STAGES.length - 1 && (
                <div className={`w-6 h-0.5 flex-shrink-0 ${
                  idx < currentStageIdx || isComplete ? 'bg-accent-green' : 'bg-border'
                }`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Total cost */}
      {isComplete && progress.cost && (
        <div className="mt-6 text-center">
          <p className="text-xs text-text-muted">
            Total: ${progress.cost.totalCostUsd.toFixed(4)} · {progress.cost.tokensUsed.toLocaleString()} tokens
          </p>
        </div>
      )}

      {/* Error detail */}
      {isFailed && progress.error && (
        <div className="mt-4 max-w-md">
          <p className="text-xs text-red-400 bg-red-400/10 rounded-md px-3 py-2">{progress.error}</p>
        </div>
      )}
    </div>
  );
}
