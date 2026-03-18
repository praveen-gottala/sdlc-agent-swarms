import { approveCommand } from './approve.js';
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

const TASK_AWAITING = {
  tasks: [
    {
      id: 'task-1',
      title: 'Build login',
      phase: 'code',
      agent: 'code_generator',
      status: 'awaiting_approval',
      depends_on: [],
      spec_ref: 'spec/api.yaml',
      branch: 'agentforge/task-1',
      pr_number: null,
      cost_usd: 0.5,
      tokens_used: 1000,
      attempts: 1,
      max_attempts: 3,
      hitl_status: 'awaiting_approval',
      hitl_channel: null,
    },
  ],
};

describe('approveCommand', () => {
  const origExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = origExitCode;
  });

  it('approves a task and updates YAML', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASK_AWAITING),
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await approveCommand('task-1', '/project', fs, output, {}, client);

    expect(getOutput()).toContain('approved');
    const updated = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(updated.tasks[0].status).toBe('approved');
    expect(updated.tasks[0].hitl_status).toBe('approved');
  });

  it('requests changes when --changes is provided', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASK_AWAITING),
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await approveCommand('task-1', '/project', fs, output, { changes: 'Add error handling' }, client);

    expect(getOutput()).toContain('Changes requested');
    expect(getOutput()).toContain('Add error handling');
    const updated = yaml.parse(fs.files.get('/project/agentforge.tasks.yaml')!);
    expect(updated.tasks[0].status).toBe('changes_requested');
    expect(updated.tasks[0].hitl_status).toBe('changes_requested');
  });

  it('calls engine approveGate when active thread exists', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASK_AWAITING),
      '/project/.agentforge/active-thread.yaml': yaml.stringify({ threadId: 'thread-xyz' }),
    });
    const { output } = createOutputCapture();
    const client = createMockClient();

    await approveCommand('task-1', '/project', fs, output, {}, client);

    expect(client.approveGate).toHaveBeenCalledWith('thread-xyz', 'task-1', 'approved', undefined);
  });

  it('errors when task not found', async () => {
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(TASK_AWAITING),
    });
    const { output, getOutput } = createOutputCapture();

    await approveCommand('nonexistent', '/project', fs, output);

    expect(getOutput()).toContain('not found');
    expect(process.exitCode).toBe(1);
  });

  it('errors when task is not awaiting approval', async () => {
    const tasks = {
      tasks: [{ ...TASK_AWAITING.tasks[0], hitl_status: 'approved', status: 'approved' }],
    };
    const fs = createMockFs({
      '/project/agentforge.tasks.yaml': yaml.stringify(tasks),
    });
    const { output, getOutput } = createOutputCapture();

    await approveCommand('task-1', '/project', fs, output);

    expect(getOutput()).toContain('not awaiting approval');
    expect(process.exitCode).toBe(1);
  });
});
