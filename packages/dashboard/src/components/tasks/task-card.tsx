'use client';

import React from 'react';

/** CI pipeline status. */
export type CiStatus = 'pending' | 'running' | 'passed' | 'failed';

/** Task priority level. */
export type TaskPriority = 'high' | 'medium' | 'low';

/** Task workflow status. */
export type TaskStatus =
  | 'backlog'
  | 'blocked'
  | 'in_progress'
  | 'in_review'
  | 'done';

/** Props for a single task card on the Kanban board. */
export interface TaskCardProps {
  id: string;
  title: string;
  agent: string;
  agentColor: string;
  prLink: string | null;
  ciStatus: CiStatus;
  cost: number;
  priority: TaskPriority;
  status: TaskStatus;
}

const priorityColors: Record<TaskPriority, string> = {
  high: 'bg-accent-red',
  medium: 'bg-accent-yellow',
  low: 'bg-accent-green',
};

const ciStatusLabel: Record<CiStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
};

const ciStatusColor: Record<CiStatus, string> = {
  pending: 'bg-text-muted',
  running: 'bg-accent-blue',
  passed: 'bg-accent-green',
  failed: 'bg-accent-red',
};

const ciBarWidth: Record<CiStatus, string> = {
  pending: 'w-1/6',
  running: 'w-1/2',
  passed: 'w-full',
  failed: 'w-3/4',
};

/**
 * Compact dark-themed task card rendered inside Kanban board columns.
 */
export function TaskCard({
  id,
  title,
  agent,
  agentColor,
  prLink,
  ciStatus,
  cost,
  priority,
}: TaskCardProps) {
  return (
    <div className="rounded-lg border border-border bg-bg-card p-3 transition-colors hover:border-text-muted cursor-pointer group">
      {/* Header: ID + priority dot */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-text-muted">{id}</span>
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[priority]}`}
          title={`${priority} priority`}
        />
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-text-primary leading-snug mb-2 line-clamp-2">
        {title}
      </p>

      {/* Agent badge */}
      <div className="flex items-center gap-1.5 mb-2">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: agentColor }}
        />
        <span className="text-xs text-text-secondary truncate">{agent}</span>
      </div>

      {/* CI status bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-text-muted">CI</span>
          <span className="text-[10px] text-text-muted">
            {ciStatusLabel[ciStatus]}
          </span>
        </div>
        <div className="h-1 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${ciStatusColor[ciStatus]} ${ciBarWidth[ciStatus]}`}
          />
        </div>
      </div>

      {/* Footer: cost + PR link */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          ${cost.toFixed(2)}
        </span>
        {prLink && (
          <span className="text-[10px] text-accent-blue group-hover:underline">
            PR {prLink}
          </span>
        )}
      </div>
    </div>
  );
}
