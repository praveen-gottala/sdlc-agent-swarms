/**
 * @module @agentforge/core/architect/critic
 *
 * Standalone Critic validation for Architect ContractBundle.
 * 14 deterministic gates — no LLM, no LangGraph dependency.
 * M3 Phase 3 wraps this as a LangGraph node.
 */

import {
  ContractBundleSchema,
} from '../types/architect.schemas.js';
import type {
  ContractBundle,
  ContextRef,
  CriticGate,
  CriticReport,
} from '../types/architect.schemas.js';
import type { EnrichedRequirement, ChangeClassification } from '../types/cross-boundary-artifacts.js';

const VALID_HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
]);

const PATH_PATTERN = /^\/[A-Za-z0-9/_{}-]+$/;

const SQL_VERBS = /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\b/i;

/** R3 ceiling: no task may exceed this estimated token budget. */
export const TASK_TOKEN_BUDGET_CEILING = 120_000;

/**
 * Validate a ContractBundle against 15 deterministic gates.
 * @param existingFiles — When set (brownfield), gate 14 enforces MODIFY tasks touch
 *   at least one existing path. When omitted (greenfield), gate 14 is skipped.
 * @param changeClassification — When set (brownfield), gate 15 enforces MODIFY
 *   frontend tasks reference screens in affectedScreens with impact 'modified'.
 */
export function validateContractBundle(
  bundle: ContractBundle,
  enrichedReq: EnrichedRequirement,
  existingFiles?: ReadonlySet<string>,
  changeClassification?: ChangeClassification,
): CriticReport {
  const gates: CriticGate[] = [
    runSchemaValidation(bundle),
    runDagAcyclic(bundle),
    runSingleWriter(bundle),
    runPrdCriterionCoverage(bundle, enrichedReq),
    runEntityReferenceIntegrity(bundle, enrichedReq),
    runGapResolutionCompleteness(bundle),
    runOpenApiLint(bundle),
    runMigrationSqlParses(bundle),
    runAdrCompleteness(bundle),
    runPatternRefResolution(bundle),
    runContextRefResolution(bundle),
    runAcceptanceCriteriaCoverage(bundle, enrichedReq),
    runTokenBudgetFeasibility(bundle),
    runModeConsistency(bundle, existingFiles),
    runModifyScreenConsistency(bundle, changeClassification),
  ];

  const gateCount = gates.length;
  const passed = gates.every((g) => g.passed);
  const failedGates = gates.filter((g) => !g.passed).map((g) => g.name);
  const summary = passed
    ? `All ${gateCount} gates passed.`
    : `Failed gates: ${failedGates.join(', ')}`;

  return { gates, passed, summary };
}

function runSchemaValidation(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const result = ContractBundleSchema.safeParse(bundle);
  if (!result.success) {
    for (const issue of result.error.issues) {
      findings.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }
  return { name: 'schema-validation', passed: findings.length === 0, findings };
}

function runDagAcyclic(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const tasks = bundle.taskPlan.tasks;

  const taskIds = new Set(tasks.map((t) => t.id));
  const adj = new Map<string, string[]>();
  for (const task of tasks) {
    adj.set(task.id, task.dependencies.filter((d) => taskIds.has(d)));
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(nodeId: string): boolean {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visited.add(nodeId);
    inStack.add(nodeId);

    for (const dep of adj.get(nodeId) ?? []) {
      if (hasCycle(dep)) {
        findings.push(`Cycle detected involving task '${nodeId}' → '${dep}'`);
        return true;
      }
    }

    inStack.delete(nodeId);
    return false;
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      hasCycle(task.id);
    }
  }

  return { name: 'dag-acyclic', passed: findings.length === 0, findings };
}

function runSingleWriter(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const fileToTasks = new Map<string, string[]>();

  for (const task of bundle.taskPlan.tasks) {
    for (const fp of task.filePaths) {
      const existing = fileToTasks.get(fp) ?? [];
      existing.push(task.id);
      fileToTasks.set(fp, existing);
    }
  }

  for (const [filePath, taskIds] of fileToTasks) {
    if (taskIds.length > 1) {
      findings.push(`File '${filePath}' written by multiple tasks: ${taskIds.join(', ')}`);
    }
  }

  return { name: 'single-writer', passed: findings.length === 0, findings };
}

function runPrdCriterionCoverage(
  bundle: ContractBundle,
  enrichedReq: EnrichedRequirement,
): CriticGate {
  const findings: string[] = [];
  const features = enrichedReq.prd.features;

  const mustHaveFeatures = features.filter(
    (f) => !f.priority || f.priority === 'must-have',
  );

  const coveredFeatureIds = new Set(Object.keys(bundle.taskPlan.featureCoverage));

  for (const feature of mustHaveFeatures) {
    const taskIds = bundle.taskPlan.featureCoverage[feature.id];
    if (!coveredFeatureIds.has(feature.id) || !taskIds || taskIds.length === 0) {
      findings.push(`Must-have feature '${feature.id}' (${feature.name}) has no tasks`);
    }
  }

  return { name: 'prd-criterion-coverage', passed: findings.length === 0, findings };
}

function runEntityReferenceIntegrity(
  bundle: ContractBundle,
  enrichedReq: EnrichedRequirement,
): CriticGate {
  const findings: string[] = [];
  const entityIds = new Set(enrichedReq.prd.dataEntities.map((e) => e.id));

  for (const screen of bundle.screenPlans) {
    for (const binding of screen.dataBindings) {
      if (!entityIds.has(binding.entityId)) {
        findings.push(
          `Screen '${screen.id}' references unknown entityId '${binding.entityId}'`,
        );
      }
    }
  }

  return { name: 'entity-reference-integrity', passed: findings.length === 0, findings };
}

function runGapResolutionCompleteness(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const memosByGapId = new Map(
    bundle.optionsBundle.memos.map((m) => [m.gapId, m]),
  );

  for (const gap of bundle.constraintSet.gaps) {
    if (gap.resolvedValue) continue;

    const memo = memosByGapId.get(gap.id);
    if (!memo || !memo.recommendation) {
      findings.push(
        `Gap '${gap.id}' (${gap.description}) has no resolvedValue and no recommendation in optionsBundle`,
      );
    }
  }

  return { name: 'gap-resolution-completeness', passed: findings.length === 0, findings };
}

function runOpenApiLint(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const seen = new Set<string>();

  for (const changeSet of bundle.apiChangeSets) {
    const allEndpoints = [
      ...changeSet.additions,
      ...changeSet.modifications,
      ...changeSet.removals,
    ];

    for (const endpoint of allEndpoints) {
      const method = endpoint.method.toUpperCase();

      if (!VALID_HTTP_METHODS.has(method)) {
        findings.push(`Invalid HTTP method '${endpoint.method}' on ${endpoint.path}`);
      }

      if (!PATH_PATTERN.test(endpoint.path)) {
        findings.push(`Invalid path '${endpoint.path}' — must match ${PATH_PATTERN.source}`);
      }

      const key = `${method}:${endpoint.path}`;
      if (seen.has(key)) {
        findings.push(`Duplicate (method, path): ${method} ${endpoint.path}`);
      }
      seen.add(key);
    }
  }

  return { name: 'openapi-lint', passed: findings.length === 0, findings };
}

function runMigrationSqlParses(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const migrations = bundle.architectureSpec.migrations;

  if (!migrations || migrations.length === 0) {
    return { name: 'migration-sql-parses', passed: true, findings: [] };
  }

  for (const migration of migrations) {
    if (!migration.sql || migration.sql.trim().length === 0) {
      findings.push(`Migration '${migration.id}' has empty SQL`);
      continue;
    }

    if (!SQL_VERBS.test(migration.sql)) {
      findings.push(
        `Migration '${migration.id}' SQL contains no recognizable SQL verb (CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)`,
      );
    }
  }

  return { name: 'migration-sql-parses', passed: findings.length === 0, findings };
}

function runAdrCompleteness(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];

  const alternativeMap = new Map<string, { blastRadius: string }>();
  for (const memo of bundle.optionsBundle.memos) {
    for (const alt of memo.alternatives) {
      alternativeMap.set(alt.id, { blastRadius: alt.blastRadius });
    }
  }

  for (const decision of bundle.architectureSpec.decisions) {
    const alt = alternativeMap.get(decision.chosenAlternativeId);
    if (!alt) continue;

    if (
      (alt.blastRadius === 'high' || alt.blastRadius === 'critical') &&
      (!decision.adrId || decision.adrId.trim().length === 0)
    ) {
      findings.push(
        `Decision for gap '${decision.gapId}' chose alternative '${decision.chosenAlternativeId}' with blastRadius '${alt.blastRadius}' but has no adrId`,
      );
    }
  }

  return { name: 'adr-completeness', passed: findings.length === 0, findings };
}

function patternIdsFromBundle(bundle: ContractBundle): ReadonlySet<string> {
  return new Set(
    (bundle.architectureSpec.implementationPatterns ?? []).map((p) => p.id),
  );
}

function resolveContextRef(bundle: ContractBundle, ref: ContextRef): boolean {
  const patterns = patternIdsFromBundle(bundle);

  switch (ref.kind) {
    case 'dataModel.entity':
      return (bundle.dataModel?.entities ?? []).some((e) => e.id === ref.id);
    case 'apiChangeSet':
      return bundle.apiChangeSets.some((a) => a.id === ref.id);
    case 'componentComposition':
      return bundle.componentComposition?.screenId === ref.id;
    case 'screenPlan':
      return bundle.screenPlans.some((s) => s.id === ref.id);
    case 'pattern':
      return patterns.has(ref.id);
    case 'existingDesign':
    case 'designDelta':
      return true;
    default: {
      const _exhaustive: never = ref.kind;
      return _exhaustive;
    }
  }
}

function runPatternRefResolution(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];
  const patternIds = patternIdsFromBundle(bundle);

  for (const task of bundle.taskPlan.tasks) {
    for (const pref of task.patternRefs) {
      if (!patternIds.has(pref)) {
        findings.push(
          `Task '${task.id}' references unknown implementation pattern id '${pref}'`,
        );
      }
    }
  }

  return { name: 'patternRef-resolution', passed: findings.length === 0, findings };
}

function runContextRefResolution(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];

  for (const task of bundle.taskPlan.tasks) {
    for (const ref of task.contextRefs) {
      if (!resolveContextRef(bundle, ref)) {
        findings.push(
          `Task '${task.id}' has unresolved contextRef { kind: '${ref.kind}', id: '${ref.id}' }`,
        );
      }
    }
  }

  return { name: 'contextRef-resolution', passed: findings.length === 0, findings };
}

function runAcceptanceCriteriaCoverage(
  bundle: ContractBundle,
  enrichedReq: EnrichedRequirement,
): CriticGate {
  const findings: string[] = [];
  const requiredIds = new Set<string>();

  for (const feature of enrichedReq.prd.features) {
    for (const ac of feature.acceptanceCriteria ?? []) {
      requiredIds.add(ac.id);
    }
  }

  if (requiredIds.size === 0) {
    return { name: 'acceptanceCriteria-coverage', passed: true, findings: [] };
  }

  const covered = new Set<string>();
  for (const task of bundle.taskPlan.tasks) {
    for (const id of task.acceptanceCriteriaIds) {
      covered.add(id);
    }
  }

  for (const id of requiredIds) {
    if (!covered.has(id)) {
      findings.push(
        `EARS acceptance criterion '${id}' is not referenced by any task (acceptanceCriteriaIds)`,
      );
    }
  }

  return { name: 'acceptanceCriteria-coverage', passed: findings.length === 0, findings };
}

function runTokenBudgetFeasibility(bundle: ContractBundle): CriticGate {
  const findings: string[] = [];

  for (const task of bundle.taskPlan.tasks) {
    if (task.estimatedTokenBudget > TASK_TOKEN_BUDGET_CEILING) {
      findings.push(
        `Task '${task.id}' estimatedTokenBudget ${task.estimatedTokenBudget} exceeds ceiling ${TASK_TOKEN_BUDGET_CEILING}`,
      );
    }
  }

  return { name: 'tokenBudget-feasibility', passed: findings.length === 0, findings };
}

function runModeConsistency(
  bundle: ContractBundle,
  existingFiles?: ReadonlySet<string>,
): CriticGate {
  if (existingFiles === undefined) {
    return { name: 'mode-consistency', passed: true, findings: [] };
  }

  const findings: string[] = [];
  for (const task of bundle.taskPlan.tasks) {
    if (task.mode !== 'MODIFY') continue;

    const touchesExisting = task.filePaths.some((fp) => existingFiles.has(fp));
    if (!touchesExisting) {
      findings.push(
        `Task '${task.id}' is MODIFY but none of its filePaths exist in the brownfield snapshot`,
      );
    }
  }

  return { name: 'mode-consistency', passed: findings.length === 0, findings };
}

function runModifyScreenConsistency(
  bundle: ContractBundle,
  changeClassification?: ChangeClassification,
): CriticGate {
  if (!changeClassification?.affectedScreens) {
    return { name: 'modify-screen-consistency', passed: true, findings: [] };
  }

  const findings: string[] = [];
  const modifiedScreenIds = new Set(
    changeClassification.affectedScreens
      .filter(s => s.impact === 'modified')
      .map(s => s.screenId),
  );

  const frontendTypes = new Set(['frontend']);

  for (const task of bundle.taskPlan.tasks) {
    if (task.mode !== 'MODIFY' || !frontendTypes.has(task.type)) continue;

    const refsExistingDesign = task.contextRefs.some(
      r => r.kind === 'existingDesign' && modifiedScreenIds.has(r.id),
    );

    if (!refsExistingDesign) {
      findings.push(
        `MODIFY frontend task '${task.id}' does not reference any screen from affectedScreens with impact 'modified' via existingDesign contextRef`,
      );
    }
  }

  return { name: 'modify-screen-consistency', passed: findings.length === 0, findings };
}
