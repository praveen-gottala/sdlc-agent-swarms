'use client';

import React from 'react';
import { TaskCard } from './task-card';
import type { TaskCardProps, TaskStatus } from './task-card';

/** Column definition for the Kanban board. */
interface KanbanColumn {
  status: TaskStatus;
  label: string;
  borderColor: string;
}

const COLUMNS: KanbanColumn[] = [
  { status: 'backlog', label: 'Backlog', borderColor: 'border-t-gray-500' },
  { status: 'blocked', label: 'Blocked', borderColor: 'border-t-accent-red' },
  {
    status: 'in_progress',
    label: 'In Progress',
    borderColor: 'border-t-accent-blue',
  },
  {
    status: 'in_review',
    label: 'In Review',
    borderColor: 'border-t-accent-purple',
  },
  { status: 'done', label: 'Done', borderColor: 'border-t-accent-green' },
];

export interface KanbanBoardProps {
  tasks: TaskCardProps[];
}

/**
 * Five-column Kanban board displaying task cards grouped by status.
 */
export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const grouped = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.status),
  }));

  return (
    <div className="grid grid-cols-5 gap-4 min-h-0 flex-1">
      {grouped.map((col) => (
        <div
          key={col.status}
          className={`flex flex-col rounded-lg border border-border bg-bg-elevated/50 border-t-2 ${col.borderColor} overflow-hidden`}
        >
          {/* Column header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-text-primary">
              {col.label}
            </span>
            <span className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full bg-bg-base text-[10px] font-bold text-text-muted px-1">
              {col.tasks.length}
            </span>
          </div>

          {/* Scrollable card list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {col.tasks.map((task) => (
              <TaskCard key={task.id} {...task} />
            ))}
            {col.tasks.length === 0 && (
              <p className="text-center text-[11px] text-text-muted py-8">
                No tasks
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
