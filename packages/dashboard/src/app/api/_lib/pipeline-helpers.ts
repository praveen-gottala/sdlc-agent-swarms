import {
  loadTasks,
  updateTaskStatus,
  saveTasks,
  createRealFs,
} from '@agentforge/core';
import { getActiveProjectRoot } from './project-reader';

/* ------------------------------------------------------------------ */
/*  Design model configuration                                         */
/* ------------------------------------------------------------------ */

/** Models available for design generation. */
export const DESIGN_MODELS = ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'] as const;
export type DesignModel = (typeof DESIGN_MODELS)[number];
export const DEFAULT_DESIGN_MODEL: DesignModel = 'claude-sonnet-4-6';

/** Validate a model string from the request. Returns the default if invalid. */
export function resolveDesignModel(raw: string | undefined | null): DesignModel {
  if (raw && (DESIGN_MODELS as readonly string[]).includes(raw)) {
    return raw as DesignModel;
  }
  return DEFAULT_DESIGN_MODEL;
}

/* ------------------------------------------------------------------ */
/*  Task status transition                                             */
/* ------------------------------------------------------------------ */

/** Transition task status safely (load -> update -> save). Best-effort — logs but does not throw. */
export function transitionTaskStatus(taskId: string, newStatus: Parameters<typeof updateTaskStatus>[2]): void {
  try {
    const projectRoot = getActiveProjectRoot();
    const fs = createRealFs();
    const loadResult = loadTasks(projectRoot, fs);
    if (!loadResult.ok) return;
    const updateResult = updateTaskStatus(loadResult.value, taskId, newStatus);
    if (!updateResult.ok) return;
    saveTasks(projectRoot, updateResult.value, fs);
  } catch {
    // Best-effort — task status transitions are non-critical
  }
}
