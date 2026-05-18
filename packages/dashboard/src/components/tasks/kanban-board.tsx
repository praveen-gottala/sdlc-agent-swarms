'use client';

import React from 'react';
import { IconLayoutKanban } from '@tabler/icons-react';
import { TaskCard } from './task-card';
import type { TaskCardProps, TaskStatus } from './task-card';
import { EmptyState } from '../ui/empty-state';

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
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
}

/**
 * Five-column Kanban board displaying task cards grouped by status.
 * Supports drag-and-drop between columns via native HTML drag events.
 */
export function KanbanBoard({ tasks, onStatusChange }: KanbanBoardProps) {
  const grouped = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.status),
  }));

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId && onStatusChange) {
      onStatusChange(taskId, targetStatus);
    }
  };

  return (
    <div className="grid grid-cols-5 gap-4 min-h-0 flex-1">
      {grouped.map((col) => (
        <div
          key={col.status}
          className={`flex flex-col rounded-lg border border-border bg-bg-elevated/50 border-t-2 ${col.borderColor} overflow-hidden`}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, col.status)}
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
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                className="cursor-grab active:cursor-grabbing"
              >
                <TaskCard {...task} />
              </div>
            ))}
            {col.tasks.length === 0 && (
              <EmptyState
                compact
                icon={IconLayoutKanban}
                title="Drag tasks here"
                description="Tasks appear when the pipeline runs"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
