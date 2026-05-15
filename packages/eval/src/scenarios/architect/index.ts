/**
 * @module @agentforge/eval/scenarios/architect
 *
 * Loads and validates Architect eval YAML scenarios.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ArchitectEvalScenarioSchema } from '../../types.js';
import type { ArchitectEvalScenario } from '../../types.js';

const SCENARIO_FILES = [
  'correct-cashpulse.yaml',
  'missing-field.yaml',
  'contradictory.yaml',
  'add-budgeting-brownfield.yaml',
];

/** All architect scenario IDs. */
export const ARCHITECT_SCENARIO_IDS = [
  'correct-cashpulse',
  'missing-field',
  'contradictory',
  'add-budgeting-brownfield',
] as const;

export type ArchitectScenarioId = (typeof ARCHITECT_SCENARIO_IDS)[number];

/**
 * Load all architect eval scenarios from YAML files.
 */
export function loadArchitectScenarios(scenariosDir?: string): readonly ArchitectEvalScenario[] {
  const dir = scenariosDir ?? defaultScenariosDir();
  return SCENARIO_FILES.map((file) => {
    const content = readFileSync(join(dir, file), 'utf-8');
    const parsed = parseYaml(content) as unknown;
    return ArchitectEvalScenarioSchema.parse(parsed);
  });
}

/**
 * Load a single architect scenario by ID.
 */
export function loadArchitectScenario(
  id: string,
  scenariosDir?: string,
): ArchitectEvalScenario | undefined {
  const scenarios = loadArchitectScenarios(scenariosDir);
  return scenarios.find((s) => s.id === id);
}

function defaultScenariosDir(): string {
  const thisFile = typeof __filename !== 'undefined'
    ? __filename
    : fileURLToPath(import.meta.url);
  return dirname(thisFile);
}
