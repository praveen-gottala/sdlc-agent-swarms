/**
 * @module @agentforge/eval/architect-runner
 *
 * Runs Architect eval scenarios against the Critic validation function.
 * Loads the ContractBundle + EnrichedRequirement from the scenario,
 * runs the Critic, and computes accuracy metrics.
 */

import {
  ContractBundleSchema,
  EnrichedRequirementSchema,
  validateContractBundle,
} from '@agentforge/core';
import type { ArchitectEvalScenario, ArchitectMetrics } from './types.js';
import { computeArchitectMetrics } from './metrics/architect-metrics.js';

/**
 * Run a single Architect eval scenario.
 * Parses the bundle + enriched requirement from raw YAML data,
 * runs the Critic, and returns accuracy metrics.
 */
export function runArchitectScenario(
  scenario: ArchitectEvalScenario,
): ArchitectMetrics {
  const bundle = ContractBundleSchema.parse(scenario.contractBundle);
  const enrichedReq = EnrichedRequirementSchema.parse(scenario.enrichedRequirement);

  const criticReport = validateContractBundle(bundle, enrichedReq);

  return computeArchitectMetrics(
    scenario.id,
    criticReport,
    scenario.expectedBehavior,
  );
}
