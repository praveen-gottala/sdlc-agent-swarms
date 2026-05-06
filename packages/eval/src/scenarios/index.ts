/**
 * @module @agentforge/eval/scenarios
 *
 * Loads and validates YAML scenario files.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { EvalScenarioSchema } from '../types.js';
import type { EvalScenario } from '../types.js';

const SCENARIO_FILES = ['pomodoro.yaml', 'habit-tracker.yaml', 'force-multi-round.yaml', 'escalation.yaml', 'cashpulse.yaml'];

/**
 * Load all scenarios from YAML files in the scenarios directory.
 */
export function loadScenarios(scenariosDir?: string): readonly EvalScenario[] {
  const dir = scenariosDir ?? defaultScenariosDir();
  return SCENARIO_FILES.map((file) => {
    const content = readFileSync(join(dir, file), 'utf-8');
    const parsed = parseYaml(content) as unknown;
    return EvalScenarioSchema.parse(parsed);
  });
}

/**
 * Load a single scenario by ID.
 */
export function loadScenario(id: string, scenariosDir?: string): EvalScenario | undefined {
  const scenarios = loadScenarios(scenariosDir);
  return scenarios.find((s) => s.id === id);
}

function defaultScenariosDir(): string {
  // Works both in src (dev) and dist (built)
  const thisFile = typeof __filename !== 'undefined'
    ? __filename
    : fileURLToPath(import.meta.url);
  return dirname(thisFile);
}

/** All scenario IDs. */
export const SCENARIO_IDS = ['pomodoro', 'habit-tracker', 'force-multi-round', 'escalation', 'cashpulse'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];
