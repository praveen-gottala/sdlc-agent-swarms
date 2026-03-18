// Mock engine-setup to avoid real filesystem calls during import
jest.mock('./engine-setup.js', () => ({
  getUvicornPath: jest.fn().mockReturnValue('uvicorn'),
  getEnginePythonPath: jest.fn().mockReturnValue('/engine/src'),
}));

import { getEnginePort, isEngineRunning, createEngineClient } from './engine-client.js';

describe('getEnginePort', () => {
  const origEnv = process.env['AGENTFORGE_ENGINE_PORT'];

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env['AGENTFORGE_ENGINE_PORT'] = origEnv;
    } else {
      delete process.env['AGENTFORGE_ENGINE_PORT'];
    }
  });

  it('returns default port 8321 when env not set', () => {
    delete process.env['AGENTFORGE_ENGINE_PORT'];
    expect(getEnginePort()).toBe(8321);
  });

  it('returns port from environment variable', () => {
    process.env['AGENTFORGE_ENGINE_PORT'] = '9000';
    expect(getEnginePort()).toBe(9000);
  });

  it('falls back to default for invalid env value', () => {
    process.env['AGENTFORGE_ENGINE_PORT'] = 'notanumber';
    expect(getEnginePort()).toBe(8321);
  });
});

describe('isEngineRunning', () => {
  it('returns false when PID file does not exist', () => {
    const mockFs = {
      exists: () => false,
      readFile: () => ({ ok: true as const, value: '123' }),
    };
    expect(isEngineRunning('/fake/path', mockFs)).toBe(false);
  });

  it('returns false when PID file cannot be read', () => {
    const mockFs = {
      exists: () => true,
      readFile: () => ({
        ok: false as const,
        error: { code: 'INVALID_STATE' as const, message: 'fail', recoverable: false },
      }),
    };
    expect(isEngineRunning('/fake/path', mockFs)).toBe(false);
  });

  it('returns false when PID is not a number', () => {
    const mockFs = {
      exists: () => true,
      readFile: () => ({ ok: true as const, value: 'garbage' }),
    };
    expect(isEngineRunning('/fake/path', mockFs)).toBe(false);
  });

  it('returns true when process.kill(pid, 0) succeeds', () => {
    const mockFs = {
      exists: () => true,
      readFile: () => ({ ok: true as const, value: String(process.pid) }),
    };
    expect(isEngineRunning('/fake/path', mockFs)).toBe(true);
  });

  it('returns false when process.kill(pid, 0) throws', () => {
    const mockFs = {
      exists: () => true,
      readFile: () => ({ ok: true as const, value: '999999999' }),
    };
    expect(isEngineRunning('/fake/path', mockFs)).toBe(false);
  });
});

describe('createEngineClient', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('health() calls GET /health', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    const client = createEngineClient(9999);
    const result = await client.health();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ok');
    }
    expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:9999/health');
  });

  it('startPhase() calls POST /phase/start', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ thread_id: 'thread-123', phase: 'design', status: 'running' }),
    });

    const client = createEngineClient(9999);
    const result = await client.startPhase('design', '/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.threadId).toBe('thread-123');
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/phase/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phase: 'design', project_root: '/project' }),
      }),
    );
  });

  it('approveGate() calls POST /gate/approve', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const client = createEngineClient(9999);
    const result = await client.approveGate('thread-1', 'gate-1', 'approved', 'looks good');

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/gate/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          thread_id: 'thread-1',
          gate_id: 'gate-1',
          decision: 'approved',
          feedback: 'looks good',
        }),
      }),
    );
  });

  it('abortTask() calls POST /task/abort', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const client = createEngineClient(9999);
    const result = await client.abortTask('task-1');

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/task/abort',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ task_id: 'task-1' }),
      }),
    );
  });

  it('returns error on fetch failure', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

    const client = createEngineClient(9999);
    const result = await client.health();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Connection refused');
    }
  });

  it('returns error on non-ok response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const client = createEngineClient(9999);
    const result = await client.health();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('500');
      expect(result.error.recoverable).toBe(true);
    }
  });

  it('returns non-recoverable error on 4xx response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const client = createEngineClient(9999);
    const result = await client.abortTask('task-1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.recoverable).toBe(false);
    }
  });
});
