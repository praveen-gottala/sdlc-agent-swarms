import { startCommand } from './start.js';
import type { FileSystem } from '../fs-utils.js';
import type { EngineClient } from '../engine-client.js';
import { Writable } from 'node:stream';

// Mock the engine-client module to avoid real filesystem/process calls
jest.mock('../engine-client.js', () => ({
  isEngineRunning: jest.fn().mockReturnValue(true),
  spawnEngine: jest.fn().mockResolvedValue({ ok: true, value: { pid: 12345 } }),
  createEngineClient: jest.fn(),
  getEnginePort: jest.fn().mockReturnValue(8321),
}));

// Mock engine-setup to avoid real Python checks
jest.mock('../engine-setup.js', () => ({
  isSetupComplete: jest.fn().mockReturnValue(true),
  setupEngine: jest.fn().mockResolvedValue({ ok: true, value: { engineDir: '/engine', venvDir: '/engine/.venv' } }),
}));

import { isEngineRunning, spawnEngine } from '../engine-client.js';
import { isSetupComplete, setupEngine } from '../engine-setup.js';

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

function createMockClient(overrides: Partial<EngineClient> = {}): EngineClient {
  return {
    startPhase: jest.fn().mockResolvedValue({ ok: true, value: { threadId: 'thread-abc' } }),
    approveGate: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    abortTask: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    pausePhase: jest.fn().mockResolvedValue({ ok: true, value: undefined }),
    health: jest.fn().mockResolvedValue({ ok: true, value: { status: 'ok' } }),
    ...overrides,
  };
}

// Minimal valid manifest YAML
const MANIFEST_YAML = `version: "1.0"
project:
  name: TestApp
  id: proj_test_123
  platforms: [web]
stack:
  frontend: react
  backend: node
  database: postgresql
  styling: tailwind
repo:
  provider: github
  org: test
  name: app
agents:
  providers:
    default: claude-sonnet-4
    overrides: {}
  sandbox:
    type: github_actions
    timeout_minutes: 15
    max_retries: 3
  orchestration:
    max_concurrent_agents: 3
    ci_wait_strategy: spawn_next
hitl:
  default: review_and_override
  overrides: {}
channels: []
routing:
  approval_requests: all
  status_updates: primary
  critical_alerts: all
budget:
  per_task_max_usd: 2
  per_phase_max_usd: 25
  monthly_max_usd: 200
  alert_threshold: 0.8`;

describe('startCommand', () => {
  const origExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = origExitCode;
    jest.clearAllMocks();
  });

  it('rejects invalid phase', async () => {
    const fs = createMockFs();
    const { output, getOutput } = createOutputCapture();

    await startCommand('invalid', '/project', fs, output);

    expect(getOutput()).toContain('Unknown phase');
    expect(process.exitCode).toBe(1);
  });

  it('errors when no manifest found', async () => {
    const fs = createMockFs();
    const { output, getOutput } = createOutputCapture();

    await startCommand('design', '/project', fs, output);

    expect(getOutput()).toContain('No agentforge.yaml found');
    expect(process.exitCode).toBe(1);
  });

  it('starts phase and persists thread ID', async () => {
    (isEngineRunning as jest.Mock).mockReturnValue(true);

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await startCommand('design', '/project', fs, output, client);

    expect(client.startPhase).toHaveBeenCalledWith('design', '/project');
    expect(getOutput()).toContain('thread-abc');
    expect(fs.files.has('/project/.agentforge/active-thread.yaml')).toBe(true);
    const threadContent = fs.files.get('/project/.agentforge/active-thread.yaml')!;
    expect(threadContent).toContain('thread-abc');
  });

  it('spawns engine when not running', async () => {
    (isEngineRunning as jest.Mock).mockReturnValue(false);
    (spawnEngine as jest.Mock).mockResolvedValue({ ok: true, value: { pid: 99999 } });

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await startCommand('design', '/project', fs, output, client);

    expect(spawnEngine).toHaveBeenCalled();
    expect(getOutput()).toContain('Engine started');
  });

  it('reports engine start failure', async () => {
    (isEngineRunning as jest.Mock).mockReturnValue(false);
    (spawnEngine as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_STATE', message: 'Engine down', recoverable: false },
    });

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();

    await startCommand('design', '/project', fs, output);

    expect(getOutput()).toContain('Failed to start engine');
    expect(process.exitCode).toBe(1);
  });

  it('auto-triggers setup when engine not installed', async () => {
    (isSetupComplete as jest.Mock).mockReturnValue(false);
    (setupEngine as jest.Mock).mockResolvedValue({ ok: true, value: { engineDir: '/engine', venvDir: '/engine/.venv' } });
    (isEngineRunning as jest.Mock).mockReturnValue(true);

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient();

    await startCommand('design', '/project', fs, output, client);

    expect(setupEngine).toHaveBeenCalled();
    expect(getOutput()).toContain('Engine not found');
    expect(getOutput()).toContain('setup complete');
  });

  it('reports setup failure and exits', async () => {
    (isSetupComplete as jest.Mock).mockReturnValue(false);
    (setupEngine as jest.Mock).mockResolvedValue({
      ok: false,
      error: { code: 'INVALID_STATE', message: 'Python not found', recoverable: false },
    });

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();

    await startCommand('design', '/project', fs, output);

    expect(getOutput()).toContain('Engine setup failed');
    expect(getOutput()).toContain('agentforge setup');
    expect(process.exitCode).toBe(1);
  });

  it('reports phase start failure', async () => {
    (isSetupComplete as jest.Mock).mockReturnValue(true);
    (isEngineRunning as jest.Mock).mockReturnValue(true);

    const fs = createMockFs({
      '/project/agentforge.yaml': MANIFEST_YAML,
    });
    const { output, getOutput } = createOutputCapture();
    const client = createMockClient({
      startPhase: jest.fn().mockResolvedValue({
        ok: false,
        error: { code: 'INVALID_STATE', message: 'Phase failed', recoverable: false },
      }),
    });

    await startCommand('design', '/project', fs, output, client);

    expect(getOutput()).toContain('Failed to start phase');
    expect(process.exitCode).toBe(1);
  });
});
