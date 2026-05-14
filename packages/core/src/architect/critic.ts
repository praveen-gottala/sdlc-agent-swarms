/**
 * @module @agentforge/core/architect/critic
 *
 * Standalone Critic validation for Architect ContractBundle.
 * 9 deterministic gates — no LLM, no LangGraph dependency.
 * M3 Phase 5 wraps this as a LangGraph node.
 */

import {
  ContractBundleSchema,
} from '../types/architect.schemas.js';
import type {
  ContractBundle,
  CriticGate,
  CriticReport,
} from '../types/architect.schemas.js';
import type { EnrichedRequirement } from '../types/cross-boundary-artifacts.js';

const VALID_HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
]);

const PATH_PATTERN = /^\/[A-Za-z0-9/_{}-]+$/;

const SQL_VERBS = /\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|SELECT)\b/i;

/**
 * Validate a ContractBundle against 9 deterministic gates.
 * Returns a CriticReport with per-gate pass/fail and findings.
 */
export function validateContractBundle(
  bundle: ContractBundle,
  enrichedReq: EnrichedRequirement,
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
  ];

  const passed = gates.every((g) => g.passed);
  const failedGates = gates.filter((g) => !g.passed).map((g) => g.name);
  const summary = passed
    ? 'All 9 gates passed.'
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
