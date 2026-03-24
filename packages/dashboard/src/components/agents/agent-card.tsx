'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export type AgentStatus = 'idle' | 'active' | 'blocked' | 'executing';
export type HitlLevel =
  | 'full_approval'
  | 'review_and_override'
  | 'notify_only'
  | 'autonomous';

export interface AgentCardProps {
  id: string;
  name: string;
  role: string;
  provider: string;
  status: AgentStatus;
  tasksCompleted: number;
  avgCost: number;
  qualityScore: number;
  hitlLevel: HitlLevel;
  isCustom: boolean;
}

const statusConfig: Record<AgentStatus, { label: string; variant: 'success' | 'info' | 'danger' | 'warning' }> = {
  idle: { label: 'Idle', variant: 'success' },
  active: { label: 'Active', variant: 'info' },
  blocked: { label: 'Blocked', variant: 'danger' },
  executing: { label: 'Executing', variant: 'warning' },
};

const hitlLabels: Record<HitlLevel, string> = {
  full_approval: 'Full Approval',
  review_and_override: 'Review & Override',
  notify_only: 'Notify Only',
  autonomous: 'Autonomous',
};

/**
 * Card displaying a single agent's info, status, and key metrics.
 */
export function AgentCard({
  id,
  name,
  role,
  provider,
  status,
  tasksCompleted,
  avgCost,
  qualityScore,
  hitlLevel,
  isCustom,
}: AgentCardProps) {
  const sc = statusConfig[status];

  return (
    <Card hover className="flex flex-col gap-3">
      {/* Top row: name + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary truncate">{name}</h3>
          <p className="mt-0.5 text-xs text-text-muted truncate">{role}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant={sc.variant}>{sc.label}</Badge>
          <Badge variant={isCustom ? 'purple' : 'default'}>
            {isCustom ? 'CUSTOM' : 'CORE'}
          </Badge>
        </div>
      </div>

      {/* Provider */}
      <p className="text-xs text-text-muted">
        Provider: <span className="text-text-secondary">{provider}</span>
      </p>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-bg-elevated px-3 py-2">
        <div className="text-center">
          <p className="text-xs text-text-muted">Tasks</p>
          <p className="text-sm font-semibold text-text-primary">{tasksCompleted}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-text-muted">Avg Cost</p>
          <p className="text-sm font-semibold text-text-primary">${avgCost.toFixed(2)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-text-muted">Quality</p>
          <p className="text-sm font-semibold text-text-primary">{qualityScore}%</p>
        </div>
      </div>

      {/* Bottom row: HITL badge + Focus button */}
      <div className="flex items-center justify-between pt-1 border-t border-border mt-auto">
        <Badge variant="default">{hitlLabels[hitlLevel]}</Badge>
        {status === 'executing' && (
          <Link href={`/agents/${id}/live`}>
            <Button size="sm" variant="primary">
              Focus
            </Button>
          </Link>
        )}
      </div>
    </Card>
  );
}
