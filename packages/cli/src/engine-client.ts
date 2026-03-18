/**
 * @module @agentforge/cli/engine-client
 *
 * Encapsulates all Python engine REST API calls.
 * The engine runs as a separate uvicorn process; this module
 * manages spawning, health-checking, and calling its endpoints.
 */

import * as path from 'node:path';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import type { Result } from '@agentforge/core';
import { Ok, Err } from '@agentforge/core';
import { getUvicornPath, getEnginePythonPath } from './engine-setup.js';

const DEFAULT_PORT = 8321;
const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_POLL_TIMEOUT_MS = 30_000;

/**
 * Get the engine port from environment or default.
 */
export function getEnginePort(): number {
  const envPort = process.env['AGENTFORGE_ENGINE_PORT'];
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PORT;
}

/**
 * Check if the engine process is running by reading the PID file.
 */
export function isEngineRunning(
  pidPath: string,
  fileSystem: { exists(p: string): boolean; readFile(p: string): Result<string> } = {
    exists: (p) => fs.existsSync(p),
    readFile: (p) => {
      try {
        return { ok: true, value: fs.readFileSync(p, 'utf-8') };
      } catch {
        return { ok: false, error: { code: 'INVALID_STATE' as const, message: 'Cannot read PID file', recoverable: false } };
      }
    },
  },
): boolean {
  if (!fileSystem.exists(pidPath)) return false;

  const result = fileSystem.readFile(pidPath);
  if (!result.ok) return false;

  const pid = parseInt(result.value.trim(), 10);
  if (isNaN(pid)) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn the Python engine as a detached process.
 * Writes PID to `.agentforge/engine.pid` and polls `/health` until ready.
 */
export async function spawnEngine(
  rootDir: string,
  port: number = getEnginePort(),
): Promise<Result<{ pid: number }>> {
  const pidPath = path.join(rootDir, '.agentforge', 'engine.pid');
  const pidDir = path.dirname(pidPath);
  if (!fs.existsSync(pidDir)) {
    fs.mkdirSync(pidDir, { recursive: true });
  }

  const uvicornBin = getUvicornPath(rootDir);
  const enginePythonPath = getEnginePythonPath(rootDir);

  const child = spawn(
    uvicornBin,
    ['agentforge_engine.server:app', '--port', String(port)],
    {
      cwd: rootDir,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PYTHONPATH: enginePythonPath,
      },
    },
  );

  child.unref();

  if (child.pid === undefined) {
    return Err({
      code: 'INVALID_STATE' as const,
      message: 'Failed to spawn engine process',
      recoverable: false,
    });
  }

  fs.writeFileSync(pidPath, String(child.pid));

  // Poll /health until ready
  const healthUrl = `http://127.0.0.1:${port}/health`;
  const deadline = Date.now() + HEALTH_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(healthUrl);
      if (resp.ok) {
        return Ok({ pid: child.pid });
      }
    } catch {
      // Engine not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  return Err({
    code: 'INVALID_STATE' as const,
    message: `Engine failed to become healthy within ${HEALTH_POLL_TIMEOUT_MS / 1000}s`,
    recoverable: true,
  });
}

/**
 * Engine REST client interface.
 */
export interface EngineClient {
  startPhase(phase: string, projectRoot: string): Promise<Result<{ threadId: string }>>;
  approveGate(threadId: string, gateId: string, decision: string, feedback?: string): Promise<Result<void>>;
  abortTask(taskId: string): Promise<Result<void>>;
  pausePhase(threadId: string): Promise<Result<void>>;
  health(): Promise<Result<{ status: string }>>;
}

/**
 * Create an engine client that communicates via fetch.
 */
export function createEngineClient(port: number = getEnginePort()): EngineClient {
  const baseUrl = `http://127.0.0.1:${port}`;

  async function post<T>(endpoint: string, body: unknown): Promise<Result<T>> {
    try {
      const resp = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Engine responded ${resp.status}: ${text}`,
          recoverable: resp.status >= 500,
        });
      }
      const data = (await resp.json()) as T;
      return Ok(data);
    } catch (err) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: `Engine request failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  }

  async function get<T>(endpoint: string): Promise<Result<T>> {
    try {
      const resp = await fetch(`${baseUrl}${endpoint}`);
      if (!resp.ok) {
        const text = await resp.text();
        return Err({
          code: 'INVALID_STATE' as const,
          message: `Engine responded ${resp.status}: ${text}`,
          recoverable: resp.status >= 500,
        });
      }
      const data = (await resp.json()) as T;
      return Ok(data);
    } catch (err) {
      return Err({
        code: 'INVALID_STATE' as const,
        message: `Engine request failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
    }
  }

  return {
    async startPhase(phase, projectRoot) {
      const result = await post<{ thread_id: string }>('/phase/start', { phase, project_root: projectRoot });
      if (!result.ok) return result;
      return Ok({ threadId: result.value.thread_id });
    },
    approveGate(threadId, gateId, decision, feedback) {
      return post<void>('/gate/approve', { thread_id: threadId, gate_id: gateId, decision, feedback });
    },
    abortTask(taskId) {
      return post<void>('/task/abort', { task_id: taskId });
    },
    pausePhase(threadId) {
      return post<void>('/phase/pause', { thread_id: threadId });
    },
    health() {
      return get<{ status: string }>('/health');
    },
  };
}
