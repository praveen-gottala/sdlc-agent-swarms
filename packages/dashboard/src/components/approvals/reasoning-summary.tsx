'use client';

import React, { useState } from 'react';

export interface ReasoningStep {
  label: string;
  content: string;
  timestamp: string;
}

export interface ReasoningSummaryProps {
  /** Ordered reasoning steps from the agent */
  steps: ReasoningStep[];
}

/**
 * Vertical mini-timeline displaying agent reasoning steps.
 * Each step has a dot, label, timestamp, and expandable content.
 */
export function ReasoningSummary({ steps }: ReasoningSummaryProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isOpen = expandedIdx === i;

        return (
          <div key={i} className="flex gap-3">
            {/* Timeline rail */}
            <div className="flex flex-col items-center">
              <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-accent-blue shrink-0" />
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className={`pb-4 ${isLast ? '' : ''}`}>
              <button
                onClick={() => setExpandedIdx(isOpen ? null : i)}
                className="flex items-center gap-2 text-left group"
              >
                <span className="text-xs font-medium text-text-primary group-hover:text-accent-blue transition-colors">
                  {step.label}
                </span>
                <span className="text-[10px] text-text-muted font-mono">
                  {step.timestamp}
                </span>
                <span className="text-[10px] text-text-muted">
                  {isOpen ? '▾' : '▸'}
                </span>
              </button>
              {isOpen && (
                <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-md">
                  {step.content}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
