'use client';

import { useState } from 'react';

/** Status for a single trace step. */
export type StepStatus = 'pass' | 'fail' | 'pending';

/** Props for an individual trace timeline step. */
export interface TraceStepProps {
  /** Step label/name. */
  label: string;
  /** Pass/fail/pending status. */
  status: StepStatus;
  /** Timestamp string, or null if not yet reached. */
  timestamp: string | null;
  /** Expandable detail content. */
  detail: string;
  /** Token count displayed for LLM steps. */
  tokenCount?: number;
  /** Whether this is the last step (hides the connecting line). */
  isLast?: boolean;
}

const STATUS_DOT: Record<StepStatus, string> = {
  pass: 'bg-accent-green',
  fail: 'bg-accent-red',
  pending: 'bg-text-muted',
};

const STATUS_BADGE: Record<StepStatus, { bg: string; text: string; label: string }> = {
  pass: { bg: 'bg-accent-green/15', text: 'text-accent-green', label: 'Passed' },
  fail: { bg: 'bg-accent-red/15', text: 'text-accent-red', label: 'Failed' },
  pending: { bg: 'bg-text-muted/15', text: 'text-text-muted', label: 'Pending' },
};

/** Individual timeline step with expandable detail. */
export function TraceStep({
  label,
  status,
  timestamp,
  detail,
  tokenCount,
  isLast = false,
}: TraceStepProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = STATUS_BADGE[status];

  return (
    <div className="relative flex gap-4">
      {/* Vertical line + dot */}
      <div className="flex flex-col items-center">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0 mt-1.5 ${STATUS_DOT[status]}`}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-border min-h-[24px]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-3 w-full text-left group"
        >
          <span className="text-sm font-medium text-text-primary group-hover:text-accent-blue transition-colors">
            {label}
          </span>
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
          >
            {badge.label}
          </span>
          {timestamp && (
            <span className="text-xs text-text-muted font-mono ml-auto">
              {timestamp}
            </span>
          )}
          {tokenCount !== undefined && (
            <span className="text-xs text-text-muted">
              {tokenCount.toLocaleString()} tokens
            </span>
          )}
          <span className="text-text-muted text-xs ml-1">
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        </button>

        {expanded && (
          <div className="mt-2 rounded-md bg-bg-base border border-border px-3 py-2">
            <pre className="text-xs text-text-secondary font-mono whitespace-pre-wrap">
              {detail}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
