'use client';

import type { Gap } from '@/lib/clarifier-chat-types';

interface OpenQuestionsSectionProps {
  readonly gaps: readonly Gap[];
}

const CATEGORY_COLORS: Record<string, string> = {
  missing: 'bg-red-500/10 text-red-400',
  ambiguous: 'bg-amber-500/10 text-amber-400',
  conflicting: 'bg-orange-500/10 text-orange-400',
  incomplete: 'bg-yellow-500/10 text-yellow-400',
};

export function OpenQuestionsSection({ gaps }: OpenQuestionsSectionProps): React.JSX.Element | null {
  if (gaps.length === 0) return null;

  return (
    <div className="space-y-2">
      {gaps.map((gap) => (
        <div key={gap.id} className="border-l-2 border-text-muted/20 pl-3 py-1.5">
          <div className="flex items-center gap-2 mb-1">
            {gap.topic && (
              <span className="text-[12px] font-medium text-text-primary">{gap.topic}</span>
            )}
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_COLORS[gap.category] ?? 'bg-bg-elevated text-text-muted'}`}>
              {gap.category}
            </span>
            {gap.divergenceScore !== undefined && (
              <span className="text-[10px] text-text-muted">
                divergence: {Math.round(gap.divergenceScore * 100)}%
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-text-secondary">{gap.description}</p>
        </div>
      ))}
    </div>
  );
}
