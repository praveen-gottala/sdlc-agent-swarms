/**
 * @module @agentforge/eval/scenarios/spine
 *
 * Loads and validates multi-stage spine eval scenarios from YAML.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAllDocuments } from 'yaml';
import { SpineEvalScenarioSchema } from '../../types.js';
import type { SpineEvalScenario } from '../../types.js';

const SCENARIO_FILE = 'spine-full-cashpulse.yaml';

/**
 * Load all spine eval scenarios from YAML (multi-document format).
 */
export function loadSpineScenarios(scenariosDir?: string): readonly SpineEvalScenario[] {
  const dir = scenariosDir ?? defaultScenariosDir();
  const content = readFileSync(join(dir, SCENARIO_FILE), 'utf-8');
  const docs = parseAllDocuments(content);
  return docs.map((doc) => {
    const parsed = doc.toJSON() as unknown;
    return SpineEvalScenarioSchema.parse(parsed);
  });
}

/**
 * Load a single spine eval scenario by ID.
 */
export function loadSpineScenario(id: string, scenariosDir?: string): SpineEvalScenario | undefined {
  const scenarios = loadSpineScenarios(scenariosDir);
  return scenarios.find((s) => s.id === id);
}

function defaultScenariosDir(): string {
  const thisFile = typeof __filename !== 'undefined'
    ? __filename
    : fileURLToPath(import.meta.url);
  // spine/ is a subdirectory of scenarios/ — go up one level
  return dirname(dirname(thisFile));
}

export const SPINE_SCENARIO_IDS = ['spine-cashpulse-greenfield', 'spine-cashpulse-brownfield'] as const;
export type SpineScenarioId = (typeof SPINE_SCENARIO_IDS)[number];
