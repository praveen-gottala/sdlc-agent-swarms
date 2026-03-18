/**
 * @module @agentforge/core/state/learnings-manager
 *
 * Manages per-role agent learning files stored at
 * `.agentforge/learnings/<role>.yaml`.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { stringify, parse } from 'yaml';
import type { AgentLearning, ObservationConfidence } from '../types/agent.js';
import type { Result } from '../types/result.js';
import { Ok, Err } from '../types/result.js';

/** Shape of the YAML file on disk. */
interface LearningsFile {
  version: string;
  agent_role: string;
  last_updated: string;
  observations: LearningsFileObservation[];
}

/** Raw YAML observation shape (snake_case keys). */
interface LearningsFileObservation {
  id: string;
  date: string;
  source: string;
  learning: string;
  confidence: ObservationConfidence;
  task_ref: string | null;
  active: boolean;
}

/** Default base directory for learnings files. */
const DEFAULT_BASE = '.agentforge/learnings';

/**
 * Resolve the path to a role's learnings file.
 */
function learningsPath(role: string, basePath?: string): string {
  const base = basePath ?? DEFAULT_BASE;
  return join(base, `${role}.yaml`);
}

/**
 * Convert a raw YAML observation to an AgentLearning.
 */
function toAgentLearning(raw: LearningsFileObservation): AgentLearning {
  return {
    id: raw.id,
    date: raw.date,
    source: raw.source,
    learning: raw.learning,
    confidence: raw.confidence,
    taskRef: raw.task_ref,
    active: raw.active,
  };
}

/**
 * Convert an AgentLearning to the raw YAML shape.
 */
function toFileObservation(learning: AgentLearning): LearningsFileObservation {
  return {
    id: learning.id,
    date: learning.date,
    source: learning.source,
    learning: learning.learning,
    confidence: learning.confidence,
    task_ref: learning.taskRef,
    active: learning.active,
  };
}

/**
 * Read all learnings for a given agent role.
 */
export async function readLearnings(
  role: string,
  basePath?: string,
): Promise<Result<AgentLearning[]>> {
  const filePath = learningsPath(role, basePath);
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = parse(content) as LearningsFile | null;
    if (!data || !Array.isArray(data.observations)) {
      return Ok([]);
    }
    return Ok(data.observations.map(toAgentLearning));
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return Ok([]);
    }
    return Err({
      code: 'INVALID_STATE',
      message: `Failed to read learnings for role "${role}": ${String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Append a new observation to a role's learnings file.
 * Assigns an incremental ID automatically.
 */
export async function addObservation(
  role: string,
  observation: Omit<AgentLearning, 'id'>,
  basePath?: string,
): Promise<Result<AgentLearning>> {
  const filePath = learningsPath(role, basePath);

  const readResult = await readLearnings(role, basePath);
  if (!readResult.ok) return readResult;

  const existing = readResult.value;
  const nextNum = existing.length + 1;
  const id = `obs_${String(nextNum).padStart(3, '0')}`;

  const newLearning: AgentLearning = { id, ...observation };

  const fileData: LearningsFile = {
    version: '1.0',
    agent_role: role,
    last_updated: new Date().toISOString(),
    observations: [...existing.map(toFileObservation), toFileObservation(newLearning)],
  };

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, stringify(fileData), 'utf-8');
    return Ok(newLearning);
  } catch (err) {
    return Err({
      code: 'INVALID_STATE',
      message: `Failed to write learnings for role "${role}": ${String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Return only active observations for a role.
 */
export async function getActiveLearnings(
  role: string,
  basePath?: string,
): Promise<Result<AgentLearning[]>> {
  const result = await readLearnings(role, basePath);
  if (!result.ok) return result;
  return Ok(result.value.filter((obs) => obs.active));
}

/**
 * Deactivate (soft-delete) an observation by ID.
 */
export async function deactivateObservation(
  role: string,
  obsId: string,
  basePath?: string,
): Promise<Result<void>> {
  const filePath = learningsPath(role, basePath);

  const readResult = await readLearnings(role, basePath);
  if (!readResult.ok) return readResult;

  const observations = readResult.value;
  const target = observations.find((obs) => obs.id === obsId);
  if (!target) {
    return Err({
      code: 'TASK_NOT_FOUND',
      message: `Observation "${obsId}" not found for role "${role}"`,
      recoverable: true,
    });
  }

  const updated = observations.map((obs) =>
    obs.id === obsId ? { ...obs, active: false } : obs,
  );

  const fileData: LearningsFile = {
    version: '1.0',
    agent_role: role,
    last_updated: new Date().toISOString(),
    observations: updated.map(toFileObservation),
  };

  try {
    await writeFile(filePath, stringify(fileData), 'utf-8');
    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'INVALID_STATE',
      message: `Failed to update learnings for role "${role}": ${String(err)}`,
      recoverable: true,
    });
  }
}

/**
 * Create an empty learnings file for a role if one doesn't already exist.
 */
export async function createLearningsFile(
  role: string,
  basePath?: string,
): Promise<Result<void>> {
  const filePath = learningsPath(role, basePath);

  try {
    await readFile(filePath, 'utf-8');
    // File already exists — no-op
    return Ok(undefined);
  } catch (err) {
    if (!isNodeError(err) || err.code !== 'ENOENT') {
      return Err({
        code: 'INVALID_STATE',
        message: `Failed to check learnings file for role "${role}": ${String(err)}`,
        recoverable: true,
      });
    }
  }

  const fileData: LearningsFile = {
    version: '1.0',
    agent_role: role,
    last_updated: new Date().toISOString(),
    observations: [],
  };

  try {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, stringify(fileData), 'utf-8');
    return Ok(undefined);
  } catch (err) {
    return Err({
      code: 'INVALID_STATE',
      message: `Failed to create learnings file for role "${role}": ${String(err)}`,
      recoverable: true,
    });
  }
}

/** Type guard for Node.js system errors with a `code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return typeof err === 'object' && err !== null && 'code' in err;
}
