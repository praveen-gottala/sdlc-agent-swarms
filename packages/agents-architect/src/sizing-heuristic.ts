/**
 * @module @agentforge/agents-architect/sizing-heuristic
 *
 * Estimates per-task token budgets for the Implementer (R3 §3-4).
 * Budget = Tier-0 (contract slice) + Tier-1 (upstream files + completion reports)
 *        + output estimate.
 *
 * Heuristic ranges per R2 §4:
 *   Too small: < 8K    → merge with sibling
 *   Right:     20-80K  → sweet spot
 *   Too big:   > 120K  → split the task (hard cap via Zod schema)
 */

import { debugLog, TASK_TOKEN_BUDGET_CEILING } from '@agentforge/core';
import type {
  TaskNode,
  ContractBundle,
  ContextRef,
} from '@agentforge/core';

const TOKENS_PER_ENTITY = 800;
const TOKENS_PER_API_CHANGESET = 600;
const TOKENS_PER_COMPONENT_COMPOSITION = 500;
const TOKENS_PER_SCREEN_PLAN = 700;
const TOKENS_PER_PATTERN = 150;
const TOKENS_PER_DEPENDENCY = 3_000;
const TOKENS_PER_FILE_OUTPUT = 400;
const BASE_SYSTEM_PROMPT_TOKENS = 4_000;

/**
 * Estimate a task's token budget from its contextRefs, dependencies, and filePaths.
 * Returns clamped value in [1_000, TASK_TOKEN_BUDGET_CEILING].
 */
export function estimateTaskTokenBudget(
  task: Pick<TaskNode, 'contextRefs' | 'dependencies' | 'filePaths' | 'id'>,
  bundle: Partial<ContractBundle>,
): number {
  let tier0 = BASE_SYSTEM_PROMPT_TOKENS;

  for (const ref of task.contextRefs) {
    tier0 += contextRefTokenCost(ref, bundle);
  }

  const tier1 = task.dependencies.length * TOKENS_PER_DEPENDENCY;
  const output = task.filePaths.length * TOKENS_PER_FILE_OUTPUT;

  const raw = tier0 + tier1 + output;
  const clamped = Math.min(Math.max(raw, 1_000), TASK_TOKEN_BUDGET_CEILING);

  if (clamped !== raw) {
    debugLog(`sizingHeuristic: task ${task.id} clamped ${raw}→${clamped}`);
  }

  return clamped;
}

function contextRefTokenCost(
  ref: ContextRef,
  bundle: Partial<ContractBundle>,
): number {
  switch (ref.kind) {
    case 'dataModel.entity': {
      const entity = bundle.dataModel?.entities.find((e) => e.id === ref.id);
      return entity ? TOKENS_PER_ENTITY + entity.fields.length * 50 : TOKENS_PER_ENTITY;
    }
    case 'apiChangeSet': {
      const cs = bundle.apiChangeSets?.find((a) => a.id === ref.id);
      if (!cs) return TOKENS_PER_API_CHANGESET;
      const endpointCount = cs.additions.length + cs.modifications.length + cs.removals.length;
      return TOKENS_PER_API_CHANGESET + endpointCount * 200;
    }
    case 'componentComposition':
      return TOKENS_PER_COMPONENT_COMPOSITION;
    case 'screenPlan':
      return TOKENS_PER_SCREEN_PLAN;
    case 'pattern':
      return TOKENS_PER_PATTERN;
    default: {
      const _exhaustive: never = ref.kind;
      return _exhaustive;
    }
  }
}
