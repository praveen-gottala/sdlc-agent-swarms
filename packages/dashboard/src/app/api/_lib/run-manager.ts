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

export interface StageTiming {
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface RunStatus {
  runId: string;
  type: 'init' | 'design-generate' | 'design-penpot';
  status: 'pending' | 'running' | 'complete' | 'failed';
  stage: string | null;
  /** Human-readable description of what the current stage is doing */
  stageDescription: string | null;
  progress: RunProgress | null;
  agentRole: string | null;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  params: Record<string, unknown>;
  cost: RunCost | null;
  /** Per-stage start/complete timestamps keyed by stage name */
  stageTimings: Record<string, StageTiming> | null;
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
    stageDescription: null,
    progress: null,
    agentRole: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
    params,
    cost: null,
    stageTimings: null,
  };

  writeRun(run);
  return { ok: true, run };
}

/** Update a run's status and stage info. Auto-manages stageTimings. */
export function updateRunStatus(
  runId: string,
  updates: Partial<Pick<RunStatus, 'status' | 'stage' | 'progress' | 'agentRole' | 'cost' | 'stageDescription'>>,
): RunStatus | null {
  const run = readRun(runId);
  if (!run) return null;

  const timings = { ...(run.stageTimings ?? {}) };

  // If the stage changed, mark the old stage as completed and start the new one
  if (updates.stage && updates.stage !== run.stage) {
    const now = new Date().toISOString();
    if (run.stage && timings[run.stage] && !timings[run.stage].completedAt) {
      timings[run.stage] = {
        ...timings[run.stage],
        completedAt: now,
        durationMs: new Date(now).getTime() - new Date(timings[run.stage].startedAt).getTime(),
      };
    }
    timings[updates.stage] = { startedAt: now };
  }

  const updated: RunStatus = {
    ...run,
    ...updates,
    stageTimings: Object.keys(timings).length > 0 ? timings : null,
  };
  writeRun(updated);
  return updated;
}

/** Mark a run as complete. */
export function completeRun(runId: string, cost?: RunCost): RunStatus | null {
  const run = readRun(runId);
  if (!run) return null;

  const now = new Date().toISOString();
  const timings = { ...(run.stageTimings ?? {}) };
  if (run.stage && timings[run.stage] && !timings[run.stage].completedAt) {
    timings[run.stage] = {
      ...timings[run.stage],
      completedAt: now,
      durationMs: new Date(now).getTime() - new Date(timings[run.stage].startedAt).getTime(),
    };
  }

  const updated: RunStatus = {
    ...run,
    status: 'complete',
    completedAt: now,
    cost: cost ?? run.cost,
    stageTimings: Object.keys(timings).length > 0 ? timings : null,
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

const STALE_RUN_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Get the currently active (pending or running) run, if any.
 *  Auto-fails runs stuck longer than STALE_RUN_TIMEOUT_MS. */
export function getActiveRun(): RunStatus | null {
  ensureRunsDir();
  const dir = runsDir();
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    try {
      const run = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as RunStatus;
      if (run.status === 'pending' || run.status === 'running') {
        const elapsed = Date.now() - new Date(run.startedAt).getTime();
        if (elapsed > STALE_RUN_TIMEOUT_MS) {
          const stale: RunStatus = {
            ...run,
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: `Pipeline timed out — stuck in "${run.status}" for ${Math.round(elapsed / 60000)}min (auto-cleanup)`,
          };
          writeFileSync(join(dir, file), JSON.stringify(stale, null, 2));
          continue;
        }
        return run;
      }
    } catch {
      // Skip corrupt files
    }
  }

  return null;
}
