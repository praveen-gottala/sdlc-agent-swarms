'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';

export type HitlLevel =
  | 'full_approval'
  | 'review_and_override'
  | 'notify_only'
  | 'autonomous';

export interface TrustCardProps {
  agentName: string;
  hitlLevel: HitlLevel;
  consecutiveApprovals: number;
  thresholdForNext: number | null;
  lastOutcome: 'approved' | 'rejected';
  enabled: boolean;
}

const hitlConfig: Record<HitlLevel, { label: string; variant: 'danger' | 'warning' | 'info' | 'success' }> = {
  full_approval: { label: 'Full Approval', variant: 'danger' },
  review_and_override: { label: 'Review & Override', variant: 'warning' },
  notify_only: { label: 'Notify Only', variant: 'info' },
  autonomous: { label: 'Autonomous', variant: 'success' },
};

/**
 * Card displaying an agent's progressive trust level, approval progress, and controls.
 */
export function TrustCard({
  agentName,
  hitlLevel,
  consecutiveApprovals,
  thresholdForNext,
  lastOutcome,
  enabled,
}: TrustCardProps) {
  const config = hitlConfig[hitlLevel];
  const progressPercent =
    thresholdForNext != null ? Math.round((consecutiveApprovals / thresholdForNext) * 100) : 100;

  return (
    <Card hover className={!enabled ? 'opacity-50' : ''}>
      <div className="flex flex-col gap-4">
        {/* Header: agent name + enabled toggle */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">{agentName}</h3>
          <button
            type="button"
            className={[
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              enabled ? 'bg-accent-blue' : 'bg-bg-elevated',
            ].join(' ')}
            role="switch"
            aria-checked={enabled}
            aria-label={`Toggle ${agentName}`}
          >
            <span
              className={[
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>

        {/* HITL level badge */}
        <div className="flex justify-center">
          <Badge variant={config.variant} className="px-4 py-1.5 text-sm">
            {config.label}
          </Badge>
        </div>

        {/* Progress toward next level */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
            <span>Consecutive approvals</span>
            <span className="text-text-secondary">
              {consecutiveApprovals}/{thresholdForNext ?? '--'}
            </span>
          </div>
          <ProgressBar value={progressPercent} color="bg-accent-blue" />
        </div>

        {/* Last outcome */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Last outcome</span>
          <Badge variant={lastOutcome === 'approved' ? 'success' : 'danger'}>
            {lastOutcome}
          </Badge>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" className="flex-1">
            Escalate
          </Button>
          <Button size="sm" variant="secondary" className="flex-1">
            Degrade
          </Button>
          <Button size="sm" variant="danger" className="flex-1">
            Reset
          </Button>
        </div>
      </div>
    </Card>
  );
}
