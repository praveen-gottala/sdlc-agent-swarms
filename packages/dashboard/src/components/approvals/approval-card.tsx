'use client';

import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CodeDiff } from './code-diff';
import { SpecContext } from './spec-context';
import { ReasoningSummary, type ReasoningStep } from './reasoning-summary';

export interface ApprovalCardProps {
  id: string;
  title: string;
  agent: string;
  hitlLevel: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timeElapsed: string;
  cost: number;
  diffPreview: string;
  specContext: string;
  reasoning: ReasoningStep[];
}

const severityVariant: Record<ApprovalCardProps['severity'], 'success' | 'warning' | 'danger' | 'purple'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
  critical: 'purple',
};

/**
 * Approval card for the HITL approval queue.
 * Shows diff preview, spec context, reasoning, and action buttons.
 */
export function ApprovalCard({
  id,
  title,
  agent,
  hitlLevel,
  severity,
  timeElapsed,
  cost,
  diffPreview,
  specContext,
  reasoning,
}: ApprovalCardProps) {
  const [diffOpen, setDiffOpen] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [requestChanges, setRequestChanges] = useState(false);
  const [changesFeedback, setChangesFeedback] = useState('');

  return (
    <div className="rounded-lg border border-border bg-bg-card border-l-4 border-l-accent-orange">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-text-muted">{id}</span>
              <h3 className="text-sm font-medium text-text-primary truncate">{title}</h3>
            </div>
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <Badge variant="info">{agent}</Badge>
              <Badge variant="warning">{hitlLevel}</Badge>
              <Badge variant={severityVariant[severity]}>{severity}</Badge>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-text-muted">{timeElapsed}</p>
            <p className="text-xs font-mono text-accent-yellow mt-0.5">${cost.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Collapsible sections */}
      <div className="px-4 py-3 space-y-2">
        {/* Code Diff */}
        <CollapsibleSection
          label="Code Diff"
          open={diffOpen}
          onToggle={() => setDiffOpen((p) => !p)}
        >
          <CodeDiff oldCode="" newCode={diffPreview} />
        </CollapsibleSection>

        {/* Spec Context */}
        <CollapsibleSection
          label="Spec Context"
          open={specOpen}
          onToggle={() => setSpecOpen((p) => !p)}
        >
          <SpecContext yamlContent={specContext} />
        </CollapsibleSection>

        {/* Agent Reasoning */}
        <CollapsibleSection
          label="Agent Reasoning"
          open={reasoningOpen}
          onToggle={() => setReasoningOpen((p) => !p)}
        >
          <ReasoningSummary steps={reasoning} />
        </CollapsibleSection>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-3 border-t border-border">
        {requestChanges ? (
          <div className="space-y-2">
            <textarea
              value={changesFeedback}
              onChange={(e) => setChangesFeedback(e.target.value)}
              placeholder="Describe the changes you want..."
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-yellow resize-none"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 text-xs font-medium rounded bg-accent-yellow text-black hover:bg-accent-yellow/90 transition-colors"
              >
                Submit Feedback
              </button>
              <button
                onClick={() => {
                  setRequestChanges(false);
                  setChangesFeedback('');
                }}
                className="px-3 py-1.5 text-xs font-medium rounded bg-bg-elevated text-text-secondary hover:bg-border/50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs font-medium rounded bg-accent-green text-black hover:bg-accent-green/90 transition-colors">
              Approve &amp; Merge
            </button>
            <button
              onClick={() => setRequestChanges(true)}
              className="px-3 py-1.5 text-xs font-medium rounded bg-accent-yellow text-black hover:bg-accent-yellow/90 transition-colors"
            >
              Request Changes
            </button>
            <button className="px-3 py-1.5 text-xs font-medium rounded bg-accent-red text-white hover:bg-accent-red/90 transition-colors">
              Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Generic collapsible section wrapper */
function CollapsibleSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary bg-bg-elevated hover:bg-border/30 transition-colors"
      >
        <span>{label}</span>
        <span className="text-text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="p-2">{children}</div>}
    </div>
  );
}
