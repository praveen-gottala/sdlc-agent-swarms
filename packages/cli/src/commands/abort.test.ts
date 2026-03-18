import { abortCommand } from './abort.js';
import type { FileSystem } from '../fs-utils.js';
import type { EngineClient } from '../engine-client.js';
import { Writable } from 'node:stream';
import * as yaml from 'yaml';

// Mock writeBridgeEvent to avoid real filesystem writes
jest.mock('@agentforge/core', () => {
  const actual = jest.requireActual('@agentforge/core');
  return {
    ...actual,
    writeBridgeEvent: jest.fn(),
  };
});

function createMockFs(files: Record<string, string> = {}): FileSystem & { files: Map<string, string> } {
  const fileMap = new Map(Object.entries(files));
  const dirs = new Set<string>();

  return {
    files: fileMap,
    readFile(filePath: string) {
      const content = fileMap.get(filePath);
      if (content === undefined) {
        return { ok: false, error: { code: 'INVALID_STATE' as const, message: `Not found: ${filePath}`, recoverable: false } };
      }
      return { ok: true, value: content };
    },
    writeFile(filePath: string, content: string) {
      fileMap.set(filePath, content);
      return { ok: true, value: undefined };
    },
    writeFileAtomic(filePath: string, content: string) {
      fileMap.set(filePath, content);
      return { ok: true, value: undefined };
    },
    exists(filePath: string) {
      return fileMap.has(filePath) || dirs.has(filePath);
    },
    mkdir(dirPath: string) {
      dirs.add(dirPath);
      return { ok: true, value: undefined };
    },
    rename() {
      return { ok: false as const, error: { code: 'INVALID_STATE' as const, message: 'Not impl', recoverable: false } };
    },
    remove(filePath: string) {
      fileMap.delete(filePath);
      return { ok: true, value: undefined };
    },
    listDir() {
      return { ok: true, value: [] as readonly string[] };
    },
    appendFile(filePath: string, content: string) {
      const existing = fileMap.get(filePath) ?? '';
      fileMap.set(filePath, existing + content);
      return { ok: true, value: undefined };
    },
  };
}

function createOutputCapture(): { output: NodeJS.WritableStream; getOutput: () => string } {
  let captured = '';
  const output = new Writable({
    write(chunk, _encoding, callback) {
      captured += chunk.toString();
      callback();
    },
  });
  return { output, getOutput: () => captured };
}

function createMockClient(): EngineClient {
  return {
    startPhase: jest.fn().mockResolvedValue({ ok: true, value: { threadId: 'thread-1' } }),
    approveGate: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    abortTask: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    pausePhase: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    health: jest.fn().mockResolvedValue({ ok: true, value: { status: 'ok' } }),
  };
}

const TASKS_DATA = {
  tasks: [
    {
      id: 'task-1',
      title: 'Build login',
      phase: 'code',
      agent: 'code_generator',
      status: 'in_progress',
      depends_on: [],
      spec_ref: 'spec/api.yaml',
      branch: 'agentforge/task-1',
      pr_number: null,
      cost_usd: 0.5,
      tokens_used: 1000,
      attempts: 1,
      max_attempts: 3,
      hitl_status: 'in_progress',
      hitl_channel: null,
    },
    {
      id: 'task-2',
      title: 'Build signup',
      phase: 'code',
      agent: 'code_generator',
      status: 'pending',
      depends_on: [],
      spec_ref: 'spec/api.yaml',
      branch: 'agentforge/task-2',
      pr_number: null,
      cost_usd: 0,
      tokens_used: 0,
      attempts: 0,
      max_attempts: 3,
      hitl_status: 'pending',
      hitl_channel: null,
    },
    {
      id: 'task-3',
      title: 'Already done',
      phase: 'code',
      agent: 'code_generator',
      status: 'completed',
      depends_on: [],
      spec_ref: 'spec/api.yaml',
      branch: null,
      pr_number: 1,
      cost_usd: 1.0,
      tokens_used: 2000,
      attempts: 1,
      max_attempts: 3,
      hitl_status: 'approved',
      hitl_channel: null,
    },
  ],
};

describe('abortCommand', () => {
  const origExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = origExitCode;
  });

  it('sets task to aborting then aborted', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await abortCommand('task-1', {}, '/project', fs, output, client, 100);

    expect(client.abortTask).toHaveBeenCalledWith('task-1');
    expect(getOutput()).toContain('aborted');

    // Final state should be aborted
    const final = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(final.tasks[0].status).toBe('aborted');
    expect(final.tasks[0].hitl_status).toBe('aborted');
  });

  it('emits AgentAborted event to file bridge', async () => {
    const { writeBridgeEvent } = jest.requireMock('@agentforge/core') as { writeBridgeEvent: jest.Mock };
    writeBridgeEvent.mockClear();

    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output } = createOutputCapture();
    const client = createMockClient();

    await abortCommand('task-1', {}, '/project', fs, output, client, 100);

    expect(writeBridgeEvent).toHaveBeenCalledWith(
      '/project',
      expect.objectContaining({ type: 'AgentAborted', taskId: 'task-1' }),
    );
  });

  it('preserves branch when --cleanup is not set', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await abortCommand('task-1', {}, '/project', fs, output, client, 100);

    expect(getOutput()).toContain('preserved for inspection');
    const final = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(final.tasks[0].branch).toBe('agentforge/task-1');
  });

  it('nulls branch when --cleanup is set', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output } = createOutputCapture();
    const client = createMockClient();

    await abortCommand('task-1', { cleanup: true }, '/project', fs, output, client, 100);

    const final = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(final.tasks[0].branch).toBeNull();
  });

  it('aborts all abortable tasks with --all', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await abortCommand(undefined, { all: true }, '/project', fs, output, client);

    expect(client.abortTask).toHaveBeenCalledTimes(2); // task-1 and task-2, not task-3
    expect(getOutput()).toContain('Aborted 2 task(s)');

    const final = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(final.tasks[0].status).toBe('aborted');
    expect(final.tasks[1].status).toBe('aborted');
    expect(final.tasks[2].status).toBe('completed'); // unchanged
  });

  it('pauses phase before --all abort when thread exists', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
      '/project/.agentforge/active-thread.yaml': yaml.stringify({ threadId: 'thread-1' }),
    });
    const { output } = createOutputCapture();
    const client = createMockClient();

    await abortCommand(undefined, { all: true }, '/project', fs, output, client);

    expect(client.pausePhase).toHaveBeenCalledWith('thread-1');
  });

  it('errors when task not found', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output, getOutput } = createOutputCapture();

    await abortCommand('nonexistent', {}, '/project', fs, output);

    expect(getOutput()).toContain('not found');
    expect(process.exitCode).toBe(1);
  });

  it('errors when task cannot be aborted', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASKS_DATA),
    });
    const { output, getOutput } = createOutputCapture();

    await abortCommand('task-3', {}, '/project', fs, output);

    expect(getOutput()).toContain('cannot be aborted');
    expect(process.exitCode).toBe(1);
  });

  it('reports no tasks when --all finds nothing abortable', async () => {
    const allDone = {
      tasks: [TASKS_DATA.tasks[2]], // only the completed task
    };
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(allDone),
    });
    const { output, getOutput } = createOutputCapture();

    await abortCommand(undefined, { all: true }, '/project', fs, output);

    expect(getOutput()).toContain('No tasks to abort');
  });
});
