'use client';

import React from 'react';
import type { TaskStatus } from './task-card';

export interface TaskFiltersProps {
  /** Currently active filter value. */
  active: TaskStatus | 'all';
  /** Callback when a filter chip is clicked. */
  onChange: (value: TaskStatus | 'all') => void;
  /** Count of tasks per status. */
  counts: Record<TaskStatus | 'all', number>;
}

const FILTERS: { label: string; value: TaskStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Backlog', value: 'backlog' },
  { label: 'Blocked', value: 'blocked' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Done', value: 'done' },
];

/**
 * Horizontal scrollable row of filter chips with task counts.
 */
export function TaskFilters({ active, onChange, counts }: TaskFiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {FILTERS.map((f) => {
        const isActive = f.value === active;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className={[
              'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
              isActive
                ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30'
                : 'bg-bg-elevated text-text-secondary border border-transparent hover:text-text-primary hover:border-border',
            ].join(' ')}
          >
            {f.label}
            <span
              className={[
                'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1',
                isActive
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-bg-base text-text-muted',
              ].join(' ')}
            >
              {counts[f.value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
