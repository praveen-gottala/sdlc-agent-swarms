import {
  loadTasks,
  saveTasks,
  getTask,
  updateTaskStatus,
  addTask,
} from './task-manager.js';
import type { FileSystem } from '../fs/file-system.js';
import type { TaskEntry, TasksFile } from '../types/task.js';
import { Ok, Err } from '../types/result.js';

/**
 * Create an in-memory FileSystem backed by a Map for unit testing.
 */
function createMockFs(files: Map<string, string> = new Map()): FileSystem {
  return {
    readFile(filePath: string) {
      const content = files.get(filePath);
      if (content === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${filePath}`,
          recoverable: false,
        });
      }
      return Ok(content);
    },
    writeFile(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    writeFileAtomic(filePath: string, content: string) {
      files.set(filePath, content);
      return Ok(undefined);
    },
    exists(filePath: string) {
      return files.has(filePath);
    },
    mkdir() {
      return Ok(undefined);
    },
    rename(oldPath: string, newPath: string) {
      const c = files.get(oldPath);
      if (c === undefined) {
        return Err({
          code: 'INVALID_STATE' as const,
          message: `File not found: ${oldPath}`,
          recoverable: false,
        });
      }
      files.set(newPath, c);
      files.delete(oldPath);
      return Ok(undefined);
    },
    remove(filePath: string) {
      files.delete(filePath);
      return Ok(undefined);
    },
    listDir() {
      return Ok([...files.keys()]);
    },
    appendFile(filePath: string, content: string) {
      const existing = files.get(filePath) ?? '';
      files.set(filePath, existing + content);
      return Ok(undefined);
    },
  };
}

function makeTask(overrides: Partial<TaskEntry> = {}): TaskEntry {
  return {
    id: 'task-1',
    title: 'Test task',
    phase: 'development',
    agent: 'dev',
    status: 'pending',
    depends_on: [],
    spec_ref: 'specs/test.md',
    branch: null,
    pr_number: null,
    cost_usd: 0,
    tokens_used: 0,
    attempts: 0,
    max_attempts: 3,
    hitl_status: 'none',
    hitl_channel: null,
    ...overrides,
  };
}

const TASKS_YAML = `
tasks:
  - id: task-1
    title: Test task
    phase: development
    agent: dev
    status: pending
    depends_on: []
    spec_ref: specs/test.md
    branch: null
    pr_number: null
    cost_usd: 0
    tokens_used: 0
    attempts: 0
    max_attempts: 3
    hitl_status: none
    hitl_channel: null
`;

describe('loadTasks', () => {
  it('reads from correct path', () => {
    const files = new Map([['/project/agentforge.tasks.yaml', TASKS_YAML]]);
    const fs = createMockFs(files);

    const result = loadTasks('/project', fs);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks).toHaveLength(1);
      expect(result.value.tasks[0].id).toBe('task-1');
    }
  });

  it('returns error for missing file', () => {
    const fs = createMockFs();

    const result = loadTasks('/project', fs);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }
  });
});

describe('saveTasks', () => {
  it('writes to correct path', () => {
    const files = new Map<string, string>();
    const fs = createMockFs(files);
    const tasksFile: TasksFile = { tasks: [makeTask()] };

    const result = saveTasks('/project', tasksFile, fs);

    expect(result.ok).toBe(true);
    expect(files.has('/project/agentforge.tasks.yaml')).toBe(true);
    const content = files.get('/project/agentforge.tasks.yaml')!;
    expect(content).toContain('task-1');
  });
});

describe('getTask', () => {
  it('finds existing task', () => {
    const tasksFile: TasksFile = { tasks: [makeTask()] };

    const result = getTask(tasksFile, 'task-1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('task-1');
      expect(result.value.title).toBe('Test task');
    }
  });

  it('returns TASK_NOT_FOUND for missing task', () => {
    const tasksFile: TasksFile = { tasks: [makeTask()] };

    const result = getTask(tasksFile, 'nonexistent');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TASK_NOT_FOUND');
      expect(result.error.message).toContain('nonexistent');
    }
  });
});

describe('updateTaskStatus', () => {
  it('allows valid transition: pending -> in_progress', () => {
    const tasksFile: TasksFile = { tasks: [makeTask({ status: 'pending' })] };

    const result = updateTaskStatus(tasksFile, 'task-1', 'in_progress');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks[0].status).toBe('in_progress');
    }
  });

  it('allows valid transition: in_progress -> completed', () => {
    const tasksFile: TasksFile = {
      tasks: [makeTask({ status: 'in_progress' })],
    };

    const result = updateTaskStatus(tasksFile, 'task-1', 'completed');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks[0].status).toBe('completed');
    }
  });

  it('allows valid transition: in_progress -> awaiting_approval', () => {
    const tasksFile: TasksFile = {
      tasks: [makeTask({ status: 'in_progress' })],
    };

    const result = updateTaskStatus(tasksFile, 'task-1', 'awaiting_approval');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks[0].status).toBe('awaiting_approval');
    }
  });

  it('allows valid transition: failed -> pending', () => {
    const tasksFile: TasksFile = { tasks: [makeTask({ status: 'failed' })] };

    const result = updateTaskStatus(tasksFile, 'task-1', 'pending');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks[0].status).toBe('pending');
    }
  });

  it('rejects invalid transition: completed -> pending', () => {
    const tasksFile: TasksFile = {
      tasks: [makeTask({ status: 'completed' })],
    };

    const result = updateTaskStatus(tasksFile, 'task-1', 'pending');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('Invalid transition');
    }
  });

  it('rejects invalid transition: pending -> completed', () => {
    const tasksFile: TasksFile = { tasks: [makeTask({ status: 'pending' })] };

    const result = updateTaskStatus(tasksFile, 'task-1', 'completed');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('Invalid transition');
    }
  });

  it('returns TASK_NOT_FOUND for missing task', () => {
    const tasksFile: TasksFile = { tasks: [makeTask()] };

    const result = updateTaskStatus(tasksFile, 'nonexistent', 'in_progress');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TASK_NOT_FOUND');
    }
  });

  it('does not mutate original tasks array', () => {
    const original: TasksFile = { tasks: [makeTask({ status: 'pending' })] };

    const result = updateTaskStatus(original, 'task-1', 'in_progress');

    expect(result.ok).toBe(true);
    expect(original.tasks[0].status).toBe('pending');
  });
});

describe('addTask', () => {
  it('adds new task', () => {
    const tasksFile: TasksFile = { tasks: [makeTask()] };
    const newTask = makeTask({ id: 'task-2', title: 'Second task' });

    const result = addTask(tasksFile, newTask);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tasks).toHaveLength(2);
      expect(result.value.tasks[1].id).toBe('task-2');
    }
  });

  it('rejects duplicate task ID', () => {
    const tasksFile: TasksFile = { tasks: [makeTask()] };
    const duplicate = makeTask({ title: 'Duplicate' });

    const result = addTask(tasksFile, duplicate);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
      expect(result.error.message).toContain('already exists');
    }
  });

  it('does not mutate original tasks array', () => {
    const original: TasksFile = { tasks: [makeTask()] };
    const newTask = makeTask({ id: 'task-2' });

    const result = addTask(original, newTask);

    expect(result.ok).toBe(true);
    expect(original.tasks).toHaveLength(1);
  });
});
