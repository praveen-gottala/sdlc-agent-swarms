/**
 * Manages async pipeline runs.
 * Writes state to `.agentforge/runs/<runId>.json` in the active project directory.
 * Constraint: one active run per project.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { getActiveProjectRoot } from './project-reader';

export interface RunCost {
  totalCostUsd: number;
  tokensUsed: number;
}

export interface RunProgress {
  current: number;
  total: number;
  label: string;
}

export interface RunStatus {
  runId: string;
  type: 'init' | 'design-generate' | 'design-penpot';
  status: 'pending' | 'running' | 'complete' | 'failed';
  stage: string | null;
  progress: RunProgress | null;
  agentRole: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  params: Record<string, unknown>;
  cost: RunCost | null;
}

function runsDir(): string {
  const root = getActiveProjectRoot();
  return join(root, '.agentforge', 'runs');
}

function ensureRunsDir(): void {
  const dir = runsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function runFilePath(runId: string): string {
  return join(runsDir(), `${runId}.json`);
}

function writeRun(run: RunStatus): void {
  ensureRunsDir();
  writeFileSync(runFilePath(run.runId), JSON.stringify(run, null, 2));
}

function readRun(runId: string): RunStatus | null {
  const filePath = runFilePath(runId);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as RunStatus;
  } catch {
    return null;
  }
}

/** Generate a short unique run ID */
function generateRunId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `run-${ts}-${rand}`;
}

/**
 * Start a new pipeline run. Returns 409-style error if a run is already active.
 */
export function startRun(
  type: RunStatus['type'],
  params: Record<string, unknown> = {},
): { ok: true; run: RunStatus } | { ok: false; error: string; activeRun: RunStatus } {
  const active = getActiveRun();
  if (active) {
    return { ok: false, error: 'A pipeline run is already in progress', activeRun: active };
  }

  const run: RunStatus = {
    runId: generateRunId(),
    type,
    status: 'pending',
    stage: null,
    progress: null,
    agentRole: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    params,
    cost: null,
  };

  writeRun(run);
  return { ok: true, run };
}

/** Update a run's status and stage info. */
export function updateRunStatus(
  runId: string,
  updates: Partial<Pick<RunStatus, 'status' | 'stage' | 'progress' | 'agentRole' | 'cost'>>,
): RunStatus | null {
  const run = readRun(runId);
  if (!run) return null;

  const updated: RunStatus = {
    ...run,
    ...updates,
  };
  writeRun(updated);
  return updated;
}

/** Mark a run as complete. */
export function completeRun(runId: string, cost?: RunCost): RunStatus | null {
  const run = readRun(runId);
  if (!run) return null;

  const updated: RunStatus = {
    ...run,
    status: 'complete',
    completedAt: new Date().toISOString(),
    cost: cost ?? run.cost,
  };
  writeRun(updated);
  return updated;
}

/** Mark a run as failed. */
export function failRun(runId: string, error: string): RunStatus | null {
  const run = readRun(runId);
  if (!run) return null;

  const updated: RunStatus = {
    ...run,
    status: 'failed',
    completedAt: new Date().toISOString(),
    error,
  };
  writeRun(updated);
  return updated;
}

/** Get a specific run's status. */
export function getRunStatus(runId: string): RunStatus | null {
  return readRun(runId);
}

/** List all runs, optionally filtered by type. Most recent first. */
export function listRuns(opts?: { type?: RunStatus['type']; limit?: number }): RunStatus[] {
  ensureRunsDir();
  const dir = runsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  let runs: RunStatus[] = [];
  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as RunStatus;
      if (opts?.type && run.type !== opts.type) continue;
      runs.push(run);
    } catch {
      // Skip corrupt files
    }
  }

  // Sort by startedAt descending
  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  if (opts?.limit) {
    runs = runs.slice(0, opts.limit);
  }

  return runs;
}

/** Get the currently active (pending or running) run, if any. */
export function getActiveRun(): RunStatus | null {
  ensureRunsDir();
  const dir = runsDir();
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as RunStatus;
      if (run.status === 'pending' || run.status === 'running') {
        return run;
      }
    } catch {
      // Skip corrupt files
    }
  }

  return null;
}
