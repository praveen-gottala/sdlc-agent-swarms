import { spawn, execSync } from 'child_process';
import { join } from 'path';
import { createConnection } from 'net';
import { existsSync } from 'fs';
import http from 'http';

const PORT = 4100;

function findMonorepoRoot(): string {
  let dir = process.cwd();
  if (existsSync(join(dir, 'packages', 'designspec-renderer'))) {
    return dir;
  }
  for (let i = 0; i < 5; i++) {
    dir = join(dir, '..');
    if (existsSync(join(dir, 'packages', 'designspec-renderer'))) {
      return dir;
    }
  }
  return process.cwd();
}

const MONOREPO_ROOT = findMonorepoRoot();
const VITE_APP_DIR = join(MONOREPO_ROOT, 'packages/designspec-renderer/src/renderer/browser/app');

let childPid: number | null = null;
let startedAt: number | null = null;
let lastError: string | null = null;

function tryConnect(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port: PORT });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 500);
    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function isPortOpen(): Promise<boolean> {
  return (await tryConnect('::1')) || (await tryConnect('127.0.0.1'));
}

/** HTTP health check — verifies the Vite server actually responds with HTML, not just TCP. */
function httpHealthCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

function killProcessOnPort(): void {
  try {
    const pids = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).trim();
    if (pids) {
      execSync(`kill -9 ${pids.split('\n').join(' ')}`, { stdio: 'ignore' });
    }
  } catch {
    // No process on port, or kill failed — both fine
  }
}

export async function getRendererStatus(): Promise<{
  status: 'ready' | 'starting' | 'stopped' | 'stale';
  pid: number | null;
  port: number;
  error?: string;
}> {
  const open = await isPortOpen();
  if (open) {
    const httpOk = await httpHealthCheck();
    if (!httpOk) {
      // TCP accept can race ahead of Vite's HTTP handler — treat as still booting or broken.
      if (childPid && startedAt && Date.now() - startedAt < 90_000) {
        return { status: 'starting', pid: childPid, port: PORT };
      }
      return {
        status: 'stale',
        pid: childPid,
        port: PORT,
        error: 'Renderer port is open but HTTP is not responding yet',
      };
    }
    // Port is open and HTTP is healthy — the renderer is serving, regardless
    // of whether this Next session owns the PID. We deliberately do NOT flag
    // externally-started servers (childPid === null) or source-staler servers
    // as 'stale' here: the resulting /api/renderer/restart is heavy (compiles
    // ~1.4k modules, kills & respawns Vite) and, when combined with headed
    // Chromium during E2E, has repeatedly OOM-killed the Next dev server.
    // Vite's own HMR handles source changes; kill-and-respawn is overkill.
    return { status: 'ready', pid: childPid, port: PORT };
  }
  if (childPid && startedAt && Date.now() - startedAt < 30_000) {
    return { status: 'starting', pid: childPid, port: PORT };
  }
  return { status: 'stopped', pid: null, port: PORT, ...(lastError ? { error: lastError } : {}) };
}

/** Kill any existing process on the renderer port and start fresh. */
export async function restartRenderer(): Promise<{
  status: 'started' | 'already_running' | 'failed';
  error?: string;
}> {
  killProcessOnPort();
  childPid = null;
  startedAt = null;
  await new Promise((r) => setTimeout(r, 500));
  return startRenderer();
}

export async function startRenderer(): Promise<{
  status: 'started' | 'already_running' | 'failed';
  error?: string;
}> {
  const open = await isPortOpen();
  if (open) {
    return { status: 'already_running' };
  }

  if (!existsSync(VITE_APP_DIR)) {
    return { status: 'failed', error: `Vite app dir not found: ${VITE_APP_DIR}` };
  }

  const nodeModulesDir = join(VITE_APP_DIR, 'node_modules');
  if (!existsSync(nodeModulesDir)) {
    const hint = `Run: npm install --prefix ${VITE_APP_DIR}`;
    return { status: 'failed', error: `Dependencies not installed in renderer app. ${hint}` };
  }

  try {
    const child = spawn('npx', ['vite', '--port', String(PORT)], {
      cwd: VITE_APP_DIR,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 500) stderr = stderr.slice(-500);
    });

    child.on('error', (err) => {
      lastError = err.message;
      childPid = null;
      startedAt = null;
    });

    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        lastError = `Vite exited with code ${code}: ${stderr}`;
      }
      childPid = null;
    });

    child.unref();
    childPid = child.pid ?? null;
    startedAt = Date.now();
    lastError = null;

    return { status: 'started' };
  } catch (err) {
    return {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
