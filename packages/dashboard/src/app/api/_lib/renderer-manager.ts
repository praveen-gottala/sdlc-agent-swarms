import { spawn } from 'child_process';
import { join } from 'path';
import { createConnection } from 'net';
import { existsSync } from 'fs';

const PORT = 4100;
// process.cwd() in Next.js dev = the dashboard package dir (packages/dashboard)
// Walk up to find the monorepo root (where package.json has workspaces or nx.json exists)
function findMonorepoRoot(): string {
  let dir = process.cwd();
  // If cwd is already the monorepo root (has packages/ dir), use it directly
  if (existsSync(join(dir, 'packages', 'designspec-renderer'))) {
    return dir;
  }
  // Otherwise walk up (e.g. cwd = packages/dashboard)
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

// Module-level state — survives across requests within the same Next.js process
let childPid: number | null = null;
let startedAt: number | null = null;
let lastError: string | null = null;

/** TCP port check — tries IPv6 (::1) then IPv4 (127.0.0.1) since Vite may bind to either */
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

export async function getRendererStatus(): Promise<{
  status: 'ready' | 'starting' | 'stopped';
  pid: number | null;
  port: number;
}> {
  const open = await isPortOpen();
  if (open) {
    return { status: 'ready', pid: childPid, port: PORT };
  }
  // If we spawned it recently (<30s), consider it "starting"
  if (childPid && startedAt && Date.now() - startedAt < 30_000) {
    return { status: 'starting', pid: childPid, port: PORT };
  }
  return { status: 'stopped', pid: null, port: PORT };
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

  try {
    const child = spawn('npx', ['vite', '--port', String(PORT)], {
      cwd: VITE_APP_DIR,
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    // Capture stderr for debugging
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
