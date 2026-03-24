'use client';

import { useCallback, useState } from 'react';

/** A single event in the activity feed */
export interface FeedEvent {
  readonly id: string;
  readonly type: string;
  readonly message: string;
  readonly timestamp: number;
  readonly severity: 'info' | 'warning' | 'error' | 'success';
  readonly source: string;
  readonly metadata?: Record<string, unknown>;
}

/** Return type for the useEventFeed hook */
export interface UseEventFeedResult {
  /** Recent events, most recent first */
  readonly events: readonly FeedEvent[];
  /** Add a new event to the feed */
  addEvent: (event: FeedEvent) => void;
  /** Clear all events */
  clearEvents: () => void;
}

const MAX_EVENTS = 50;

/** Generate mock development events for a React+Node+Prisma project */
function createMockEvents(): FeedEvent[] {
  const now = Date.now();
  const minute = 60_000;

  return [
    {
      id: 'evt-001',
      type: 'AgentStarted',
      message: 'Frontend Coder agent started task: Create UserProfile component',
      timestamp: now - 1 * minute,
      severity: 'info',
      source: 'orchestrator',
      metadata: { agentId: 'frontend-coder', taskId: 'task-007' },
    },
    {
      id: 'evt-002',
      type: 'TaskStatusChanged',
      message: 'Task "Setup Prisma schema" moved from in_progress to awaiting_approval',
      timestamp: now - 3 * minute,
      severity: 'warning',
      source: 'orchestrator',
      metadata: { taskId: 'task-003', from: 'in_progress', to: 'awaiting_approval' },
    },
    {
      id: 'evt-003',
      type: 'AgentCompleted',
      message: 'API Designer agent completed: Define REST endpoints for /api/users',
      timestamp: now - 5 * minute,
      severity: 'success',
      source: 'orchestrator',
      metadata: { agentId: 'api-designer', taskId: 'task-005' },
    },
    {
      id: 'evt-004',
      type: 'HITLApprovalRequested',
      message: 'Approval needed: Database migration adds 3 new tables',
      timestamp: now - 8 * minute,
      severity: 'warning',
      source: 'governance',
      metadata: { gateId: 'gate-db-migration', agentId: 'backend-coder', taskId: 'task-004' },
    },
    {
      id: 'evt-005',
      type: 'BudgetAlert',
      message: 'Design phase at 78% of budget ($3.12 / $4.00)',
      timestamp: now - 12 * minute,
      severity: 'warning',
      source: 'governance',
      metadata: { level: 'phase', currentSpendUsd: 3.12, limitUsd: 4.0 },
    },
    {
      id: 'evt-006',
      type: 'CodeGenComplete',
      message: 'Generated 4 files for UserList component (React + tests)',
      timestamp: now - 15 * minute,
      severity: 'success',
      source: 'frontend-coder',
      metadata: { taskId: 'task-006', filesGenerated: 4 },
    },
    {
      id: 'evt-007',
      type: 'TestsComplete',
      message: 'Test suite passed: 12/12 tests for authentication module',
      timestamp: now - 20 * minute,
      severity: 'success',
      source: 'test-writer',
      metadata: { taskId: 'task-002', passCount: 12, failCount: 0 },
    },
    {
      id: 'evt-008',
      type: 'AgentFailed',
      message: 'Build Fixer agent failed: Could not resolve TypeScript error in prisma/client',
      timestamp: now - 25 * minute,
      severity: 'error',
      source: 'orchestrator',
      metadata: { agentId: 'build-fixer', taskId: 'task-009', error: 'TS2307' },
    },
    {
      id: 'evt-009',
      type: 'PRCreated',
      message: 'PR #42 created: Add user authentication endpoints',
      timestamp: now - 30 * minute,
      severity: 'info',
      source: 'backend-coder',
      metadata: { taskId: 'task-002', prNumber: 42, branch: 'feat/auth-endpoints' },
    },
    {
      id: 'evt-010',
      type: 'ReviewComplete',
      message: 'Code review approved: PR #41 — Prisma schema and migrations',
      timestamp: now - 35 * minute,
      severity: 'success',
      source: 'reviewer',
      metadata: { taskId: 'task-003', prNumber: 41, decision: 'approved' },
    },
  ];
}

/**
 * Activity feed hook that maintains a list of recent events (max 50).
 * Provides mock events for development.
 */
export function useEventFeed(): UseEventFeedResult {
  const [events, setEvents] = useState<FeedEvent[]>(() => createMockEvents());

  const addEvent = useCallback((event: FeedEvent) => {
    setEvents((prev) => {
      const next = [event, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, addEvent, clearEvents };
}
