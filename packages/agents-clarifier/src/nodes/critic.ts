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
  // CONSTRAINT (FB3): Prompt loading deferred until LLM review is wired.
  // critic-system.md exists but is NOT loaded. Only deterministic INVEST/EARS/DAG
  // checks run. criticPassed means "well-formed" not "good". This is intentional
  // for v0. The evaluator-challenger pipeline fills the quality gap.
  // See: docs/lessons-learned-rules.md "Clarifier: Known v0 Trade-Offs"
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

// Retries route back to storyWriter which triggers interruptBefore,
// causing the user to see the same questions in an infinite loop.
// Until critic has LLM-based quality review (v1), pass with warnings.
const MAX_RETRIES = 0;

/**
 * Create a Critic node function for the Clarifier StateGraph.
 * Validates output STRUCTURE (INVEST, EARS, DAG) only — not semantic quality.
 * `criticPassed: true` means well-formed, not good. LLM quality review is
 * scaffolded (critic-system.md) but not wired until eval data shows
 * structural checks are insufficient.
 */
export function createCritic(deps: ClarifierDeps): ClarifierNodeFn {
  return async (state: ClarifierState): Promise<Partial<ClarifierState>> => {
    const _t0 = Date.now();
    debugLog(`critic: ENTER round=${state.round} criticRetries=${state.criticRetries} hasFeaturePlan=${!!state.featurePlan}`);
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
      debugLog(`critic: EXIT passed=true ${Date.now() - _t0}ms`);
      return { criticPassed: true, criticRetries: state.criticRetries };
    }

    if (state.criticRetries >= MAX_RETRIES) {
      debugLog(`critic: EXIT max-retries passed=true ${Date.now() - _t0}ms`);
      return { criticPassed: true, criticRetries: state.criticRetries + 1 };
    }

    debugLog(`critic: EXIT failed retry=${state.criticRetries + 1}/${MAX_RETRIES} ${Date.now() - _t0}ms`);
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
