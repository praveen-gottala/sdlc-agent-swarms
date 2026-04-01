'use client';

import { TraceStep } from './trace-step';
import type { StepStatus } from './trace-step';

/** A single step in the trace timeline. */
export interface TraceTimelineStep {
  /** Step label/name. */
  label: string;
  /** Pass/fail/pending status. */
  status: StepStatus;
  /** Timestamp string, or null if not yet reached. */
  timestamp: string | null;
  /** Detail content shown when expanded. */
  detail: string;
  /** Optional token count for LLM steps. */
  tokenCount?: number;
  /** Step category: stage transition, LLM call, or debug log. */
  stepType?: 'stage' | 'llm-call' | 'log';
}

/** Props for the trace timeline component. */
export interface TraceTimelineProps {
  /** Ordered array of trace steps. */
  steps: TraceTimelineStep[];
}

/** Vertical step-by-step timeline for an agent execution trace. */
export function TraceTimeline({ steps }: TraceTimelineProps) {
  return (
    <div className="rounded-lg bg-bg-card border border-border p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">
        Execution Timeline
      </h3>
      <div className="flex flex-col">
        {steps.map((step, idx) => {
          const isLog = step.stepType === 'log';
          return (
            <div key={`${step.label}-${idx}`} className={isLog ? 'pl-4 opacity-70' : ''}>
              <TraceStep
                label={isLog ? `> ${step.label}` : step.label}
                status={step.status}
                timestamp={step.timestamp}
                detail={step.detail}
                tokenCount={step.tokenCount}
                isLast={idx === steps.length - 1}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
