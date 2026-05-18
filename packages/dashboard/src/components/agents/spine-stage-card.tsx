'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Icon } from '@tabler/icons-react';

export type StageStatus = 'idle' | 'running' | 'complete' | 'failed';

export interface SpineStageCardProps {
  stageKey: string;
  stageNumber: number;
  name: string;
  description: string;
  icon: Icon;
  color: string;
  status: StageStatus;
  runsCompleted: number;
  avgDurationMs: number;
  totalCostUsd: number;
}

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
  stageNumber,
  name,
  description,
  icon: IconComponent,
  color,
  status,
  runsCompleted,
  avgDurationMs,
  totalCostUsd,
}: SpineStageCardProps): React.JSX.Element {
  const isRunning = status === 'running';
  const isComplete = status === 'complete';

  return (
    <div
      className="group relative overflow-hidden rounded-2xl border transition-all duration-300"
      style={{
        borderColor: isRunning ? `${color}50` : 'var(--color-border)',
        background: 'var(--color-bg-card)',
        animation: 'fade-in 0.4s ease-out forwards',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = `${color}40`;
        e.currentTarget.style.boxShadow = `0 0 30px ${color}10, 0 4px 20px rgba(0,0,0,0.2)`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isRunning ? `${color}50` : 'var(--color-border)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Background gradient glow */}
      <div
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${color}12 0%, transparent 70%)`,
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease',
          opacity: isRunning ? 1 : 0.5,
        }}
      />

      {/* Stage number watermark */}
      <span
        style={{
          position: 'absolute',
          bottom: -8,
          right: 12,
          fontSize: 72,
          fontWeight: 800,
          color: `${color}08`,
          lineHeight: 1,
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {stageNumber}
      </span>

      <div className="relative flex flex-col gap-4 p-5">
        {/* Icon + stage info */}
        <div className="flex items-start gap-4">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isRunning
                ? `linear-gradient(135deg, ${color}, ${color}cc)`
                : `${color}15`,
              border: isRunning ? 'none' : `1.5px solid ${color}25`,
              boxShadow: isRunning ? `0 0 24px ${color}30` : 'none',
              animation: isRunning ? 'spine-glow 2s ease-in-out infinite' : undefined,
              transition: 'all 0.4s ease',
              flexShrink: 0,
            }}
          >
            <IconComponent
              size={22}
              stroke={1.5}
              style={{ color: isRunning ? '#fff' : color }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-text-primary">{name}</h3>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color }}>
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: color, animation: 'pulse-dot 1.5s ease-in-out infinite' }}
                  />
                  Running
                </span>
              )}
              {isComplete && (
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <p className="text-sm text-text-muted mt-1 leading-relaxed">{description}</p>
          </div>
        </div>

        {/* Stats — only when there's data */}
        {runsCompleted > 0 ? (
          <div className="flex items-center gap-6 pt-3 border-t border-border/50">
            <div>
              <span className="text-lg font-bold text-text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {runsCompleted}
              </span>
              <span className="text-xs text-text-dim ml-1.5">{runsCompleted === 1 ? 'run' : 'runs'}</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div>
              <span className="text-sm font-semibold text-text-secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatDuration(avgDurationMs)}
              </span>
              <span className="text-xs text-text-dim ml-1.5">avg</span>
            </div>
            <div className="w-px h-4 bg-border" />
            <div>
              <span className="text-sm font-semibold" style={{ color, fontVariantNumeric: 'tabular-nums' }}>
                ${totalCostUsd.toFixed(2)}
              </span>
              <span className="text-xs text-text-dim ml-1.5">total</span>
            </div>
          </div>
        ) : (
          <div className="pt-3 border-t border-border/50">
            <p className="text-xs text-text-dim">No runs yet — start a project to see this stage in action</p>
          </div>
        )}

        {/* Action */}
        {isRunning && (
          <Link href={`/agents/${stageKey}/live`}>
            <Button size="sm" variant="primary">View Live</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
