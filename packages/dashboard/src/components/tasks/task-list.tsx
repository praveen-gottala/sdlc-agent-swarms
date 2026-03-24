'use client';

import React, { useMemo, useState } from 'react';
import type { TaskCardProps, TaskStatus, CiStatus, TaskPriority } from './task-card';

/** Sortable column key. */
type SortKey = 'id' | 'title' | 'agent' | 'branch' | 'ciStatus' | 'cost' | 'status' | 'priority';

type SortDir = 'asc' | 'desc';

const statusBadgeClasses: Record<TaskStatus, string> = {
  backlog: 'bg-text-muted/15 text-text-muted',
  blocked: 'bg-accent-red/15 text-accent-red',
  in_progress: 'bg-accent-blue/15 text-accent-blue',
  in_review: 'bg-accent-purple/15 text-accent-purple',
  done: 'bg-accent-green/15 text-accent-green',
};

const statusLabels: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

const ciStatusIcon: Record<CiStatus, { char: string; color: string }> = {
  pending: { char: '\u25CB', color: 'text-text-muted' },
  running: { char: '\u25D4', color: 'text-accent-blue' },
  passed: { char: '\u2713', color: 'text-accent-green' },
  failed: { char: '\u2717', color: 'text-accent-red' },
};

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const statusOrder: Record<TaskStatus, number> = {
  blocked: 0,
  in_progress: 1,
  in_review: 2,
  backlog: 3,
  done: 4,
};

/** Extended task data for the list view (includes branch). */
export interface TaskListItem extends TaskCardProps {
  branch: string;
}

export interface TaskListProps {
  tasks: TaskListItem[];
}

interface ColumnDef {
  key: SortKey;
  label: string;
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', className: 'w-[90px]' },
  { key: 'title', label: 'Task' },
  { key: 'agent', label: 'Agent', className: 'w-[120px]' },
  { key: 'branch', label: 'Branch', className: 'w-[140px]' },
  { key: 'ciStatus', label: 'CI', className: 'w-[60px]' },
  { key: 'cost', label: 'Cost', className: 'w-[80px] text-right' },
  { key: 'status', label: 'Status', className: 'w-[110px]' },
  { key: 'priority', label: 'Priority', className: 'w-[80px]' },
];

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sortable table view of tasks.
 */
export function TaskList({ tasks }: TaskListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    const arr = [...tasks];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      switch (sortKey) {
        case 'priority':
          va = priorityOrder[a.priority];
          vb = priorityOrder[b.priority];
          break;
        case 'status':
          va = statusOrder[a.status];
          vb = statusOrder[b.status];
          break;
        case 'cost':
          va = a.cost;
          vb = b.cost;
          break;
        default:
          va = a[sortKey] ?? '';
          vb = b[sortKey] ?? '';
      }
      return compare(va, vb) * dir;
    });
    return arr;
  }, [tasks, sortKey, sortDir]);

  const arrow = (key: SortKey) => {
    if (key !== sortKey) return '';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-elevated/50">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'px-3 py-2.5 text-left text-xs font-semibold text-text-muted cursor-pointer select-none hover:text-text-primary transition-colors',
                    col.className ?? '',
                  ].join(' ')}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {arrow(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((task) => (
              <tr
                key={task.id}
                className="border-b border-border last:border-b-0 hover:bg-bg-elevated/30 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2.5 font-mono text-xs text-text-muted">
                  {task.id}
                </td>
                <td className="px-3 py-2.5 text-text-primary font-medium">
                  {task.title}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: task.agentColor }}
                    />
                    <span className="text-text-secondary text-xs truncate">
                      {task.agent}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-text-muted truncate">
                  {task.branch}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`text-sm ${ciStatusIcon[task.ciStatus].color}`}
                    title={task.ciStatus}
                  >
                    {ciStatusIcon[task.ciStatus].char}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-text-secondary tabular-nums">
                  ${task.cost.toFixed(2)}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClasses[task.status]}`}
                  >
                    {statusLabels[task.status]}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1 text-xs capitalize ${
                      task.priority === 'high'
                        ? 'text-accent-red'
                        : task.priority === 'medium'
                          ? 'text-accent-yellow'
                          : 'text-accent-green'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        task.priority === 'high'
                          ? 'bg-accent-red'
                          : task.priority === 'medium'
                            ? 'bg-accent-yellow'
                            : 'bg-accent-green'
                      }`}
                    />
                    {task.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
