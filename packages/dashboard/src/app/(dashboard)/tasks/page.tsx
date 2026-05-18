'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { TaskFilters } from '@/components/tasks/task-filters';
import { KanbanBoard } from '@/components/tasks/kanban-board';
import { TaskList } from '@/components/tasks/task-list';
import type { TaskCardProps, TaskStatus } from '@/components/tasks/task-card';
import type { TaskListItem } from '@/components/tasks/task-list';

const VIEW_TOGGLE_ITEMS = [
  { label: 'Board', value: 'board' },
  { label: 'List', value: 'list' },
];

/** Agent color mapping for display purposes. */
const AGENT_COLORS: Record<string, string> = {
  'code-gen': '#3b82f6',
  'ux-designer': '#a855f7',
  'spec-writer': '#14b8a6',
  'design': '#a855f7',
  'cicd': '#f97316',
  'devops': '#f97316',
  'test-runner': '#22c55e',
  'observer': '#06b6d4',
  'custom-qa': '#64748b',
};

/** Status mapping from API format to page format. */
function mapStatus(apiStatus: string): TaskStatus {
  const mapping: Record<string, TaskStatus> = {
    'pending': 'backlog',
    'in_progress': 'in_progress',
    'awaiting_approval': 'in_review',
    'approved': 'done',
    'completed': 'done',
    'review': 'in_review',
    'done': 'done',
    'blocked': 'blocked',
    'failed': 'blocked',
  };
  return mapping[apiStatus] ?? 'backlog';
}

/** Tasks page with Board/List toggle, filters, and task views. */
export default function TasksPage() {
  const [tasks, setTasks] = useState<(TaskCardProps & { branch: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<string>('board');
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');

  useEffect(() => {
    fetch('/api/tasks')
      .then(res => res.json())
      .then(json => {
        const apiTasks = json.tasks ?? json.data ?? [];
        const mapped = apiTasks.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          title: t.title as string,
          agent: t.agent as string,
          agentColor: AGENT_COLORS[(t.agent as string)] ?? '#64748b',
          branch: (t.branch as string) ?? `feat/${(t.id as string)}`,
          prLink: t.pr_number ? `#${t.pr_number}` : null,
          ciStatus: (t.status === 'completed' ? 'passed' : 'pending') as 'pending' | 'running' | 'passed' | 'failed',
          cost: (t.cost_usd as number) ?? 0,
          priority: (t.priority as string) ?? 'medium',
          status: mapStatus(t.status as string),
        }));
        setTasks(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const c: Record<TaskStatus | 'all', number> = {
      all: tasks.length,
      backlog: 0,
      blocked: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    };
    for (const t of tasks) {
      c[t.status]++;
    }
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.status === filter);
  }, [filter, tasks]);

  const listItems: TaskListItem[] = useMemo(
    () =>
      filteredTasks.map((t) => ({
        ...t,
      })),
    [filteredTasks],
  );

  /** Map UI status back to API status for the PATCH call. */
  const toApiStatus = useCallback((uiStatus: TaskStatus): string => {
    const reverseMap: Record<TaskStatus, string> = {
      backlog: 'pending',
      in_progress: 'in_progress',
      in_review: 'awaiting_approval',
      done: 'completed',
      blocked: 'blocked',
    };
    return reverseMap[uiStatus] ?? 'pending';
  }, []);

  /** Handle drag-drop status change via PATCH /api/tasks/[id]/status. */
  const handleStatusChange = useCallback(
    (taskId: string, newStatus: TaskStatus) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
      );

      fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: toApiStatus(newStatus) }),
      }).catch(() => {
        // Revert on failure
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: t.status } : t))
        );
      });
    },
    [toApiStatus],
  );

  if (loading) return <div className="flex items-center justify-center h-64 text-text-muted">Loading...</div>;

  return (
    <div className="flex flex-col h-full min-h-0 p-6 gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Tasks</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} across{' '}
            {new Set(tasks.map((t) => t.agent)).size}{' '}
            {new Set(tasks.map((t) => t.agent)).size === 1 ? 'agent' : 'agents'}
          </p>
        </div>
        <ToggleGroup items={VIEW_TOGGLE_ITEMS} value={view} onChange={setView} />
      </div>

      {/* Filters */}
      <TaskFilters active={filter} onChange={setFilter} counts={counts} />

      {/* View */}
      <div className="flex-1 min-h-0">
        {view === 'board' ? (
          <KanbanBoard tasks={filteredTasks} onStatusChange={handleStatusChange} />
        ) : (
          <TaskList tasks={listItems} />
        )}
      </div>
    </div>
  );
}
