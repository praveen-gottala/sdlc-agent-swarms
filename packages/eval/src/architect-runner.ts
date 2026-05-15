/**
 * @module @agentforge/eval/architect-runner
 *
 * Runs Architect eval scenarios against the Critic validation function.
 * Loads the ContractBundle + EnrichedRequirement from the scenario,
 * runs the Critic, and computes accuracy metrics.
 *
 * M3 Phase 7: supports existingFiles for brownfield scenarios,
 * validates TaskNode field population, and exposes retry-routing
 * information in the returned metrics.
 */

import {
  ContractBundleSchema,
  EnrichedRequirementSchema,
  validateContractBundle,
} from '@agentforge/core';
import type { ContractBundle, CriticReport } from '@agentforge/core';
import type { ArchitectEvalScenario, ArchitectMetrics } from './types.js';
import { computeArchitectMetrics } from './metrics/architect-metrics.js';

/** Fields every task must have populated (M3 Phase 1 schema extensions). */
const REQUIRED_TASK_FIELDS = ['mode', 'estimatedTokenBudget', 'contextRefs', 'patternRefs', 'acceptanceCriteriaIds'] as const;

/**
 * Validate that every task in the bundle has the 5 required TaskNode fields populated.
 * Returns an array of findings (empty = all valid).
 */
function validateTaskNodeFields(bundle: ContractBundle): string[] {
  const findings: string[] = [];

  for (const task of bundle.taskPlan.tasks) {
    for (const field of REQUIRED_TASK_FIELDS) {
      const value = task[field];
      if (value === undefined || value === null) {
        findings.push(`Task '${task.id}' is missing required field '${field}'`);
      }
    }
  }

  return findings;
}

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

  const existingFiles = scenario.existingFiles
    ? new Set(scenario.existingFiles)
    : undefined;

  const criticReport = validateContractBundle(bundle, enrichedReq, existingFiles);

  const metrics = computeArchitectMetrics(
    scenario.id,
    criticReport,
    scenario.expectedBehavior,
  );

  return {
    ...metrics,
    taskNodeFieldFindings: validateTaskNodeFields(bundle),
  };
}

/**
 * Run a scenario and return the full CriticReport + retry routing info
 * for integration-level assertions.
 */
export function runArchitectScenarioDetailed(
  scenario: ArchitectEvalScenario,
): { metrics: ArchitectMetrics; criticReport: CriticReport; firstFailedGate: string | null } {
  const bundle = ContractBundleSchema.parse(scenario.contractBundle);
  const enrichedReq = EnrichedRequirementSchema.parse(scenario.enrichedRequirement);

  const existingFiles = scenario.existingFiles
    ? new Set(scenario.existingFiles)
    : undefined;

  const criticReport = validateContractBundle(bundle, enrichedReq, existingFiles);

  const metrics = computeArchitectMetrics(
    scenario.id,
    criticReport,
    scenario.expectedBehavior,
  );

  const firstFailedGate = criticReport.passed
    ? null
    : criticReport.gates.find((g) => !g.passed)?.name ?? null;

  return {
    metrics: { ...metrics, taskNodeFieldFindings: validateTaskNodeFields(bundle) },
    criticReport,
    firstFailedGate,
  };
}
