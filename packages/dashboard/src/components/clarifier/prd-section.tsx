'use client';

import { useState, type ReactNode } from 'react';

interface PrdSectionProps {
  readonly title: string;
  readonly count?: number;
  readonly children: ReactNode;
  readonly defaultExpanded?: boolean;
  readonly animationDelay?: number;
}

export function PrdSection({ title, count, children, defaultExpanded = true, animationDelay = 0 }: PrdSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className="mb-4 animate-[fadeSlideUp_0.3s_ease-out_both]"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 py-2 text-left group"
      >
        <svg
          className={`h-3.5 w-3.5 text-text-muted/50 transition-transform ${expanded ? 'rotate-90' : ''}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <h3 className="text-[14px] font-semibold text-text-primary group-hover:text-accent-blue transition-colors">
          {title}
        </h3>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-[11px] font-medium text-accent-blue">
            {count}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pl-5 border-l border-border/30 ml-1.5">
          {children}
        </div>
      )}
    </div>
  );
}
