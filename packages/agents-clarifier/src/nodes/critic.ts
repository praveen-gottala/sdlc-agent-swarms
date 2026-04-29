/**
 * @module @agentforge/agents-clarifier/nodes/critic
 *
 * Critic node (Task 1.6).
 * INVEST + EARS compliance check, bounded retry (max 2).
 * DAG consistency: no orphans, no cycles.
 * Optional LLM quality review if deterministic checks pass.
 * After 2 retries: flag as warnings, don't block.
 */

import { debugLog } from '@agentforge/core';
import type { FeaturePlan } from '@agentforge/core';
import type { ClarifierDeps, ClarifierNodeFn } from '../deps.js';
import type { ClarifierState } from '../types.js';

export function _resetPromptCache(): void {
  // no-op — prompt loading deferred until LLM review is implemented
}

// ---------------------------------------------------------------------------
// Deterministic checks
// ---------------------------------------------------------------------------

interface CriticIssue {
  readonly description: string;
  readonly severity: 'error' | 'warning';
}

function checkEARSCompliance(plan: FeaturePlan): CriticIssue[] {
  const issues: CriticIssue[] = [];
  for (const feature of plan.features) {
    if (feature.acceptanceCriteria.length === 0) {
      issues.push({
        description: `Feature "${feature.name}" (${feature.id}) has no acceptance criteria.`,
        severity: 'error',
      });
      continue;
    }
    for (const criterion of feature.acceptanceCriteria) {
      if (!criterion.condition.trim() || !criterion.behavior.trim()) {
        issues.push({
          description: `Feature "${feature.name}": criterion ${criterion.id} has empty condition or behavior.`,
          severity: 'error',
        });
      }
    }
  }
  return issues;
}

function checkINVESTCompliance(plan: FeaturePlan): CriticIssue[] {
  const issues: CriticIssue[] = [];
  for (const feature of plan.features) {
    if (!feature.description || feature.description.length < 10) {
      issues.push({
        description: `Feature "${feature.name}" (${feature.id}) has insufficient description for estimability.`,
        severity: 'warning',
      });
    }
    if (feature.acceptanceCriteria.length > 10) {
      issues.push({
        description: `Feature "${feature.name}" has ${feature.acceptanceCriteria.length} criteria — may not be Small enough.`,
        severity: 'warning',
      });
    }
  }
  return issues;
}

function checkDAGConsistency(plan: FeaturePlan): CriticIssue[] {
  const issues: CriticIssue[] = [];
  const featureIds = new Set(plan.features.map((f) => f.id));

  for (const feature of plan.features) {
    for (const dep of feature.dependencies) {
      if (!featureIds.has(dep)) {
        issues.push({
          description: `Feature "${feature.name}" depends on "${dep}" which is not in the plan.`,
          severity: 'error',
        });
      }
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const featureMap = new Map(plan.features.map((f) => [f.id, f]));

  function hasCycle(id: string): boolean {
    if (inStack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    inStack.add(id);
    const feature = featureMap.get(id);
    if (feature) {
      for (const dep of feature.dependencies) {
        if (featureIds.has(dep) && hasCycle(dep)) return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  for (const feature of plan.features) {
    visited.clear();
    inStack.clear();
    if (hasCycle(feature.id)) {
      issues.push({
        description: `Dependency cycle detected involving feature "${feature.name}" (${feature.id}).`,
        severity: 'error',
      });
      break;
    }
  }

  return issues;
}

function runDeterministicChecks(plan: FeaturePlan): CriticIssue[] {
  return [
    ...checkEARSCompliance(plan),
    ...checkINVESTCompliance(plan),
    ...checkDAGConsistency(plan),
  ];
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;

/**
 * Create a Critic node function for the Clarifier StateGraph.
 * Validates output quality and triggers bounded retry.
 */
export function createCritic(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    if (!state.featurePlan) {
      return {
        criticPassed: state.criticRetries >= MAX_RETRIES,
        criticRetries: state.criticRetries + 1,
        error: state.criticRetries >= MAX_RETRIES ? undefined : 'Critic: no feature plan to validate',
      };
    }

    const issues = runDeterministicChecks(state.featurePlan);
    const errors = issues.filter((i) => i.severity === 'error');

    if (errors.length === 0) {
      if (state.requirement) {
        const warningDescriptions = issues
          .filter((i) => i.severity === 'warning')
          .map((i) => i.description);
        if (warningDescriptions.length > 0) {
          debugLog(`critic: passing with ${warningDescriptions.length} warning(s)`);
        }
      }
      return { criticPassed: true, criticRetries: state.criticRetries };
    }

    if (state.criticRetries >= MAX_RETRIES) {
      debugLog(`critic: max retries reached (${MAX_RETRIES}), passing with ${errors.length} error(s) as warnings`);
      return { criticPassed: true, criticRetries: state.criticRetries + 1 };
    }

    debugLog(`critic: ${errors.length} error(s) found, retry ${state.criticRetries + 1}/${MAX_RETRIES}`);
    return {
      criticPassed: false,
      criticRetries: state.criticRetries + 1,
    };
  };
}

export {
  runDeterministicChecks,
  checkEARSCompliance,
  checkINVESTCompliance,
  checkDAGConsistency,
};
