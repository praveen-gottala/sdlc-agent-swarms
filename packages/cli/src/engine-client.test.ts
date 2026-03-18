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

  it('startPhase() calls POST /api/phases/start', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ threadId: 'thread-123' }),
    });

    const client = createEngineClient(9999);
    const result = await client.startPhase('design', '/project');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.threadId).toBe('thread-123');
    }
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/phases/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phase: 'design', projectRoot: '/project' }),
      }),
    );
  });

  it('approveGate() calls POST /api/gates/approve', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const client = createEngineClient(9999);
    const result = await client.approveGate('thread-1', 'gate-1', 'approved', 'looks good');

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/gates/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          gateId: 'gate-1',
          decision: 'approved',
          feedback: 'looks good',
        }),
      }),
    );
  });

  it('abortTask() calls POST /api/tasks/abort', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const client = createEngineClient(9999);
    const result = await client.abortTask('task-1');

    expect(result.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/tasks/abort',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskId: 'task-1' }),
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
    const result = await client.startPhase('design', '/project');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.recoverable).toBe(false);
    }
  });
});
