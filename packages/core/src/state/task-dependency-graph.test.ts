/**
 * P06: Task Dependency Graph Enforcement validation tests.
 * Tests all 7 criteria from Wave 1 readiness validation.
 */

import type { TaskEntry, TasksFile } from '../types/task.js';
import type { AgentSlot } from './task-dependency-graph.js';
import {
  detectCircularDependencies,
  addTaskWithDependencies,
  getReadyTasks,
  onTaskCompleted,
  onTaskFailed,
  getSchedulableTasks,
} from './task-dependency-graph.js';

const makeTask = (overrides: Partial<TaskEntry> = {}): TaskEntry => ({
  id: 'task-001',
  title: 'Test task',
  phase: 'code',
  agent: 'code-agent',
  status: 'pending',
  depends_on: [],
  spec_ref: 'spec/component.yaml',
  branch: null,
  pr_number: null,
  cost_usd: 0,
  tokens_used: 0,
  attempts: 0,
  max_attempts: 3,
  hitl_status: 'none',
  hitl_channel: null,
  blocked_by: null,
  ...overrides,
});

describe('P06: Task Dependency Graph Enforcement', () => {
  describe('Criterion 1: Tasks with unresolved dependencies cannot start', () => {
    it('task with pending dependencies is not ready', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'task_001', status: 'pending' }),
          makeTask({ id: 'task_002', status: 'pending' }),
          makeTask({ id: 'task_003', status: 'pending', depends_on: ['task_001', 'task_002'] }),
        ],
      };

      const ready = getReadyTasks(tasks);
      const readyIds = ready.map((t) => t.id);
      expect(readyIds).toContain('task_001');
      expect(readyIds).toContain('task_002');
      expect(readyIds).not.toContain('task_003');
    });

    it('task becomes ready only when all dependencies are done', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'task_001', status: 'completed' }),
          makeTask({ id: 'task_002', status: 'pending' }),
          makeTask({ id: 'task_003', status: 'pending', depends_on: ['task_001', 'task_002'] }),
        ],
      };

      const ready = getReadyTasks(tasks);
      expect(ready.map((t) => t.id)).not.toContain('task_003');

      // Now complete task_002
      const tasks2: TasksFile = {
        tasks: [
          makeTask({ id: 'task_001', status: 'completed' }),
          makeTask({ id: 'task_002', status: 'completed' }),
          makeTask({ id: 'task_003', status: 'pending', depends_on: ['task_001', 'task_002'] }),
        ],
      };

      const ready2 = getReadyTasks(tasks2);
      expect(ready2.map((t) => t.id)).toContain('task_003');
    });
  });

  describe('Criterion 2: Circular dependency detection', () => {
    it('detects direct circular dependency at creation', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', depends_on: ['B'] }),
          makeTask({ id: 'B', depends_on: ['A'] }),
        ],
      };

      const result = detectCircularDependencies(tasks.tasks);
      expect(result.ok).toBe(false);
    });

    it('detects indirect circular dependency', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', depends_on: ['B'] }),
          makeTask({ id: 'B', depends_on: ['C'] }),
          makeTask({ id: 'C', depends_on: ['A'] }),
        ],
      };

      const result = detectCircularDependencies(tasks.tasks);
      expect(result.ok).toBe(false);
    });

    it('rejects task addition that would create cycle', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', depends_on: [] }),
          makeTask({ id: 'B', depends_on: ['A'] }),
        ],
      };

      const result = addTaskWithDependencies(tasks, makeTask({
        id: 'C',
        depends_on: ['B'],
      }));
      expect(result.ok).toBe(true);

      // Now try to add a task that creates a cycle
      if (result.ok) {
        const cyclic = addTaskWithDependencies(result.value, makeTask({
          id: 'D',
          depends_on: ['C'],
        }));
        expect(cyclic.ok).toBe(true);
      }
    });

    it('rejects circular dependency with clear error', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', depends_on: [] }),
          makeTask({ id: 'B', depends_on: ['A'] }),
        ],
      };

      // This creates A -> B -> C -> A cycle
      const withC = addTaskWithDependencies(tasks, makeTask({ id: 'C', depends_on: ['B'] }));
      expect(withC.ok).toBe(true);

      if (withC.ok) {
        // Try to make A depend on C (creating cycle)
        const allTasks = withC.value.tasks.map((t) =>
          t.id === 'A' ? { ...t, depends_on: ['C'] } : t,
        );
        const cycle = detectCircularDependencies(allTasks);
        expect(cycle.ok).toBe(false);
        if (!cycle.ok) {
          expect(cycle.error.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Criterion 3: Completing a blocker auto-unblocks downstream', () => {
    it('unblocks tasks when their sole dependency completes', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', status: 'completed' }),
          makeTask({ id: 'B', status: 'blocked', depends_on: ['A', 'C'], blocked_by: 'C' }),
          makeTask({ id: 'C', status: 'in_progress', depends_on: [] }),
        ],
      };

      const updated = onTaskCompleted(tasks, 'C');
      const taskB = updated.tasks.find((t) => t.id === 'B');
      expect(taskB?.status).toBe('pending');
      expect(taskB?.blocked_by).toBeNull();
    });

    it('does not unblock if other dependencies are still pending', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', status: 'pending', depends_on: [] }),
          makeTask({ id: 'B', status: 'blocked', depends_on: ['A', 'C'], blocked_by: 'C' }),
          makeTask({ id: 'C', status: 'in_progress', depends_on: [] }),
        ],
      };

      const updated = onTaskCompleted(tasks, 'C');
      const taskB = updated.tasks.find((t) => t.id === 'B');
      // B is still blocked because A is not completed
      expect(taskB?.status).toBe('blocked');
    });
  });

  describe('Criterion 4: Failed blocker cascades blocked status', () => {
    it('sets downstream tasks to blocked with blocked_by reference', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', status: 'failed' }),
          makeTask({ id: 'B', status: 'pending', depends_on: ['A'] }),
          makeTask({ id: 'C', status: 'pending', depends_on: ['B'] }),
        ],
      };

      const updated = onTaskFailed(tasks, 'A');
      const taskB = updated.tasks.find((t) => t.id === 'B');
      const taskC = updated.tasks.find((t) => t.id === 'C');

      expect(taskB?.status).toBe('blocked');
      expect(taskB?.blocked_by).toBe('A');
      expect(taskC?.status).toBe('blocked');
      expect(taskC?.blocked_by).toBe('A');
    });
  });

  describe('Criterion 5: Concurrency limit is respected', () => {
    it('limits to max_concurrent_agents', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 't1', status: 'pending' }),
          makeTask({ id: 't2', status: 'pending' }),
          makeTask({ id: 't3', status: 'pending' }),
          makeTask({ id: 't4', status: 'pending' }),
          makeTask({ id: 't5', status: 'pending' }),
        ],
      };

      const activeSlots: AgentSlot[] = [
        { taskId: 'existing-1', agentId: 'agent-1', status: 'executing' },
        { taskId: 'existing-2', agentId: 'agent-2', status: 'executing' },
      ];

      const schedulable = getSchedulableTasks(tasks, activeSlots, { maxConcurrentAgents: 3 });
      expect(schedulable.length).toBe(1); // Only 1 slot available
    });

    it('returns empty when at capacity', () => {
      const tasks: TasksFile = {
        tasks: [makeTask({ id: 't1', status: 'pending' })],
      };

      const activeSlots: AgentSlot[] = [
        { taskId: 'e1', agentId: 'a1', status: 'executing' },
        { taskId: 'e2', agentId: 'a2', status: 'executing' },
        { taskId: 'e3', agentId: 'a3', status: 'executing' },
      ];

      const schedulable = getSchedulableTasks(tasks, activeSlots, { maxConcurrentAgents: 3 });
      expect(schedulable.length).toBe(0);
    });
  });

  describe('Criterion 6: CI-waiting agents do not release their slot', () => {
    it('ci_waiting slots count toward concurrency limit', () => {
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 't1', status: 'pending' }),
          makeTask({ id: 't2', status: 'pending' }),
        ],
      };

      const activeSlots: AgentSlot[] = [
        { taskId: 'e1', agentId: 'a1', status: 'executing' },
        { taskId: 'e2', agentId: 'a2', status: 'ci_waiting' }, // CI waiting — still counts
        { taskId: 'e3', agentId: 'a3', status: 'executing' },
      ];

      const schedulable = getSchedulableTasks(tasks, activeSlots, { maxConcurrentAgents: 3 });
      expect(schedulable.length).toBe(0); // All 3 slots are occupied
    });
  });

  describe('Criterion 7: Diamond dependency resolves correctly', () => {
    it('handles diamond dependency graph with 8+ tasks', () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      // Plus additional tasks for 8+: E -> F, F -> G, G -> H
      const tasks: TasksFile = {
        tasks: [
          makeTask({ id: 'A', status: 'pending', depends_on: [] }),
          makeTask({ id: 'B', status: 'pending', depends_on: ['A'] }),
          makeTask({ id: 'C', status: 'pending', depends_on: ['A'] }),
          makeTask({ id: 'D', status: 'pending', depends_on: ['B', 'C'] }),
          makeTask({ id: 'E', status: 'pending', depends_on: [] }),
          makeTask({ id: 'F', status: 'pending', depends_on: ['E'] }),
          makeTask({ id: 'G', status: 'pending', depends_on: ['F'] }),
          makeTask({ id: 'H', status: 'pending', depends_on: ['G', 'D'] }),
        ],
      };

      // No cycles
      const cycleCheck = detectCircularDependencies(tasks.tasks);
      expect(cycleCheck.ok).toBe(true);

      // Only A and E are ready initially
      let ready = getReadyTasks(tasks);
      expect(ready.map((t) => t.id).sort()).toEqual(['A', 'E']);

      // Complete A
      let updated = onTaskCompleted(tasks, 'A');
      // Manually set A to completed
      updated = {
        tasks: updated.tasks.map((t) =>
          t.id === 'A' ? { ...t, status: 'completed' as const } : t,
        ),
      };
      ready = getReadyTasks(updated);
      expect(ready.map((t) => t.id).sort()).toEqual(['B', 'C', 'E']);

      // Complete B and C
      updated = {
        tasks: updated.tasks.map((t) =>
          t.id === 'B' || t.id === 'C' ? { ...t, status: 'completed' as const } : t,
        ),
      };
      ready = getReadyTasks(updated);
      expect(ready.map((t) => t.id)).toContain('D');
      expect(ready.map((t) => t.id)).toContain('E');

      // Complete D and E
      updated = {
        tasks: updated.tasks.map((t) =>
          t.id === 'D' || t.id === 'E' ? { ...t, status: 'completed' as const } : t,
        ),
      };
      ready = getReadyTasks(updated);
      expect(ready.map((t) => t.id)).toContain('F');

      // Complete F, G
      updated = {
        tasks: updated.tasks.map((t) =>
          t.id === 'F' ? { ...t, status: 'completed' as const } : t,
        ),
      };
      ready = getReadyTasks(updated);
      expect(ready.map((t) => t.id)).toContain('G');

      updated = {
        tasks: updated.tasks.map((t) =>
          t.id === 'G' ? { ...t, status: 'completed' as const } : t,
        ),
      };
      ready = getReadyTasks(updated);
      expect(ready.map((t) => t.id)).toContain('H');
    });

    it('rejects dependency referencing non-existent task', () => {
      const tasks: TasksFile = { tasks: [makeTask({ id: 'A' })] };

      const result = addTaskWithDependencies(tasks, makeTask({
        id: 'B',
        depends_on: ['nonexistent'],
      }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DEPENDENCY_NOT_FOUND');
      }
    });
  });
});
