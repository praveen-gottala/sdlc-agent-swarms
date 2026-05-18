'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Icon } from '@tabler/icons-react';

export type StageStatus = 'idle' | 'running' | 'complete' | 'failed';

export interface SpineStageCardProps {
  stageKey: string;
  name: string;
  description: string;
  icon: Icon;
  color: string;
  model: string;
  status: StageStatus;
  runsCompleted: number;
  avgDurationMs: number;
  totalCostUsd: number;
}

const statusConfig: Record<StageStatus, { label: string; variant: 'success' | 'info' | 'danger' | 'default' }> = {
  idle: { label: 'Idle', variant: 'default' },
  running: { label: 'Running', variant: 'info' },
  complete: { label: 'Complete', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
};

function formatDuration(ms: number): string {
  if (ms === 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return `${mins}m ${remainSecs}s`;
}

export function SpineStageCard({
  stageKey,
  name,
  description,
  icon: IconComponent,
  color,
  model,
  status,
  runsCompleted,
  avgDurationMs,
  totalCostUsd,
}: SpineStageCardProps): React.JSX.Element {
  const sc = statusConfig[status];
  const isRunning = status === 'running';

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-bg-card transition-all hover:border-border-bright"
      style={{ animation: 'fade-in 0.3s ease-out forwards' }}
    >
      {/* Left accent bar */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: color,
          borderRadius: '3px 0 0 3px',
          opacity: status === 'idle' ? 0.4 : 0.9,
          transition: 'opacity 0.3s ease',
        }}
      />

      <div className="flex flex-col gap-3 p-4 pl-5">
        {/* Top row: icon + name + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={isRunning ? 'animate-spine-glow' : ''}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `${color}18`,
                border: `1.5px solid ${color}30`,
                animation: isRunning ? 'spine-glow 2s ease-in-out infinite' : undefined,
                transition: 'all 0.3s ease',
              }}
            >
              <IconComponent size={18} stroke={1.5} style={{ color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{name}</h3>
              <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{description}</p>
            </div>
          </div>
          <Badge variant={sc.variant}>{sc.label}</Badge>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-bg-elevated px-3 py-2.5">
          <div className="text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Runs</p>
            <p className="text-sm font-semibold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {runsCompleted}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Avg Time</p>
            <p className="text-sm font-semibold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDuration(avgDurationMs)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-text-muted uppercase tracking-wider">Cost</p>
            <p className="text-sm font-semibold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${totalCostUsd.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Bottom row: model + action */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <p className="text-xs text-text-dim">
            Model: <span className="text-text-muted">{model}</span>
          </p>
          {isRunning && (
            <Link href={`/agents/${stageKey}/live`}>
              <Button size="sm" variant="primary">View Live</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
