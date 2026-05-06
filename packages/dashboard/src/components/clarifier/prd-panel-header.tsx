'use client';

interface PrdPanelHeaderProps {
  readonly title: string;
  readonly confidence?: number;
  readonly isComplete: boolean;
}

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.8) return { text: 'High', color: 'text-green-400' };
  if (c >= 0.6) return { text: 'Medium', color: 'text-yellow-400' };
  return { text: 'Low', color: 'text-red-400' };
}

export function PrdPanelHeader({ title, confidence, isComplete }: PrdPanelHeaderProps): React.JSX.Element {
  const cl = confidence !== undefined ? confidenceLabel(confidence) : null;

  return (
    <div className="sticky top-0 z-10 bg-bg-base/95 backdrop-blur-sm px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[16px] font-semibold text-text-primary truncate">{title || 'PRD Document'}</h2>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isComplete ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {isComplete ? 'Complete' : 'Draft'}
            </span>
            {cl && (
              <span className={`text-[12px] font-medium ${cl.color}`}>
                {Math.round(confidence! * 100)}% {cl.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
