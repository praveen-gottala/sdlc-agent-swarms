/**
 * @module @agentforge/agents-architect/graph/nodes/task-planner
 *
 * Node 5 — Task Planner with sizing + dry-Critic.
 * Single Opus call producing TaskPlan DAG. After emission, runs gates 10-14
 * as a dry-run Critic; if any fail, retries once with failure feedback.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  parsePromptFrontmatter,
  debugLog,
  ContextRefSchema,
  TaskModeSchema,
  TaskTypeSchema,
  validateContractBundle,
} from '@agentforge/core';
import type {
  ContractBundle,
  CriticReport,
  TaskPlan,
} from '@agentforge/core';
import type { ArchitectDeps, ArchitectNodeFn } from '../../deps.js';
import type { ArchitectStateType } from '../state.js';
import { estimateTaskTokenBudget } from '../../sizing-heuristic.js';
import { stateCompositionsToBundle } from '../../context-slicer.js';

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

let systemPromptCache: string | undefined;
let promptVersionCache: string | undefined;

function loadSystemPrompt(): string {
  if (systemPromptCache) return systemPromptCache;
  const promptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..', '..', 'prompts', 'task-planner.md',
  );
  const raw = readFileSync(promptPath, 'utf-8');
  const parsed = parsePromptFrontmatter(raw);
  systemPromptCache = parsed.body;
  promptVersionCache = parsed.frontmatter.version as string | undefined;
  return systemPromptCache;
}

function getPromptVersion(): string | undefined {
  if (!systemPromptCache) loadSystemPrompt();
  return promptVersionCache;
}

/** Test-only: reset cached prompt. */
export function _resetTaskPlannerPromptCache(): void {
  systemPromptCache = undefined;
  promptVersionCache = undefined;
}

// ---------------------------------------------------------------------------
// Zod schema for LLM structured output
// ---------------------------------------------------------------------------

const TaskPlannerLlmOutputSchema = z.object({
  projectId: z.string(),
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    filePaths: z.array(z.string()),
    dependencies: z.array(z.string()),
    writeOrder: z.number().int().min(0),
    type: TaskTypeSchema,
    mode: TaskModeSchema,
    estimatedTokenBudget: z.number().int().min(0).max(120_000),
    contextRefs: z.array(ContextRefSchema).default([]),
    patternRefs: z.array(z.string()).default([]),
    acceptanceCriteriaIds: z.array(z.string()).default([]),
  })),
  featureCoverage: z.record(z.string(), z.array(z.string())),
});

/** JSON Schema for provider structured output (hand-authored — mirrors Zod above). */
export const TASK_PLANNER_RESPONSE_SCHEMA = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      projectId: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            filePaths: { type: 'array', items: { type: 'string' } },
            dependencies: { type: 'array', items: { type: 'string' } },
            writeOrder: { type: 'integer', minimum: 0 },
            type: {
              type: 'string',
              enum: ['scaffold', 'backend', 'frontend', 'test', 'integration'],
            },
            mode: { type: 'string', enum: ['NEW', 'MODIFY'] },
            estimatedTokenBudget: { type: 'integer', minimum: 0, maximum: 120000 },
            contextRefs: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  kind: {
                    type: 'string',
                    enum: [
                      'dataModel.entity',
                      'apiChangeSet',
                      'componentComposition',
                      'screenPlan',
                      'pattern',
                    ],
                  },
                  id: { type: 'string' },
                },
                required: ['kind', 'id'],
              },
            },
            patternRefs: { type: 'array', items: { type: 'string' } },
            acceptanceCriteriaIds: { type: 'array', items: { type: 'string' } },
          },
          required: [
            'id', 'title', 'description', 'filePaths', 'dependencies',
            'writeOrder', 'type', 'mode', 'estimatedTokenBudget',
            'contextRefs', 'patternRefs', 'acceptanceCriteriaIds',
          ],
        },
      },
      featureCoverage: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
    },
    required: ['projectId', 'tasks', 'featureCoverage'],
  },
};

// ---------------------------------------------------------------------------
// User message builder
// ---------------------------------------------------------------------------

/** Build Node 5 user message (exported for wiring tests). */
export function buildTaskPlannerUserMessage(state: ArchitectStateType): string {
  const parts: string[] = [];

  parts.push(`## Project mode\n${state.mode}`);

  if (state.enrichedRequirement) {
    const prd = state.enrichedRequirement.prd;
    parts.push('\n## PRD Features\n');
    for (const f of prd.features) {
      parts.push(`### ${f.id}: ${f.name} (priority: ${f.priority ?? 'must-have'})`);
      parts.push(f.description);
      if (f.acceptanceCriteria?.length) {
        parts.push('**Acceptance criteria:**');
        for (const ac of f.acceptanceCriteria) {
          parts.push(`- ${ac.id}: ${ac.formatted}`);
        }
      }
      parts.push('');
    }

    if (prd.dataEntities?.length) {
      parts.push('\n## PRD Data Entities\n');
      for (const e of prd.dataEntities) {
        parts.push(`- ${e.id}: ${e.name}`);
      }
    }
  }

  if (state.architectureSpec) {
    parts.push('\n## Architecture Spec\n');
    parts.push(`**Stack:** ${JSON.stringify(state.architectureSpec.stackConfig)}`);
    parts.push('\n**Decisions:**');
    for (const d of state.architectureSpec.decisions) {
      parts.push(`- Gap ${d.gapId} → ${d.chosenAlternativeId}: ${d.rationale}`);
    }
    if (state.architectureSpec.implementationPatterns?.length) {
      parts.push('\n**Implementation Patterns:**');
      for (const p of state.architectureSpec.implementationPatterns) {
        parts.push(`- ${p.id}: ${p.rule}`);
      }
    }
  }

  if (state.dataModelSpec) {
    parts.push('\n## Data Model\n');
    for (const entity of state.dataModelSpec.entities) {
      parts.push(`### Entity: ${entity.id} (${entity.name})`);
      for (const field of entity.fields) {
        parts.push(`  - ${field.name}: ${field.type}${field.required ? ' (required)' : ''}`);
      }
    }
  }

  if (state.apiChangeSets.length > 0) {
    parts.push('\n## API Change Sets\n');
    for (const cs of state.apiChangeSets) {
      parts.push(`### ${cs.id}`);
      for (const ep of cs.additions) {
        parts.push(`  + ${ep.method} ${ep.path} — ${ep.description}`);
      }
      for (const ep of cs.modifications) {
        parts.push(`  ~ ${ep.method} ${ep.path} — ${ep.description}`);
      }
    }
  }

  if (state.componentCompositions.length > 0) {
    parts.push('\n## Component Compositions\n');
    for (const cc of state.componentCompositions) {
      parts.push(`### Screen: ${cc.screenId}`);
      for (const node of cc.componentTree) {
        parts.push(`  - ${node.id}: ${node.type}`);
      }
    }
  }

  if (state.screenPlans.length > 0) {
    parts.push('\n## Screen Plans\n');
    for (const sp of state.screenPlans) {
      parts.push(`### ${sp.id} (${sp.screenType}) — ${sp.route}`);
      parts.push(`  Components: ${sp.components.join(', ')}`);
      if (sp.dataBindings.length > 0) {
        parts.push(`  Data bindings: ${sp.dataBindings.map((b) => `${b.entityId}.${b.field}`).join(', ')}`);
      }
    }
  }

  if (state.designSystemDiff) {
    parts.push('\n## Design System Diff\n');
    if (state.designSystemDiff.addedTokens.length) {
      parts.push(`Added tokens: ${state.designSystemDiff.addedTokens.join(', ')}`);
    }
    if (state.designSystemDiff.modifiedTokens.length) {
      parts.push(`Modified tokens: ${state.designSystemDiff.modifiedTokens.join(', ')}`);
    }
  }

  if (state.changeClassification) {
    parts.push('\n## Change Classification (brownfield)\n');
    parts.push(JSON.stringify(state.changeClassification, null, 2));
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Dry-Critic (gates 10-14 only)
// ---------------------------------------------------------------------------

const DRY_CRITIC_GATES = new Set([
  'patternRef-resolution',
  'contextRef-resolution',
  'acceptanceCriteria-coverage',
  'tokenBudget-feasibility',
  'mode-consistency',
]);

/**
 * Run only gates 10-14 against a partial bundle to catch TaskPlan-specific
 * issues before the full Critic pass. Returns the subset of findings.
 */
function runDryCritic(
  taskPlan: TaskPlan,
  state: ArchitectStateType,
): CriticReport {
  const bundle = assembleBundleFromState(state, taskPlan);
  const req = state.enrichedRequirement!;
  const fullReport = validateContractBundle(
    bundle,
    req,
    state.existingFiles ?? undefined,
  );

  const relevantGates = fullReport.gates.filter((g) => DRY_CRITIC_GATES.has(g.name));
  const passed = relevantGates.every((g) => g.passed);
  const failedNames = relevantGates.filter((g) => !g.passed).map((g) => g.name);

  return {
    gates: relevantGates,
    passed,
    summary: passed
      ? 'Dry-Critic gates 10-14 passed.'
      : `Dry-Critic failed: ${failedNames.join(', ')}`,
  };
}

function assembleBundleFromState(
  state: ArchitectStateType,
  taskPlan: TaskPlan,
): ContractBundle {
  return {
    projectId: state.constraintSet?.projectId ?? '',
    version: '1.0.0',
    constraintSet: state.constraintSet!,
    optionsBundle: state.optionsBundle!,
    architectureSpec: state.architectureSpec!,
    adrs: [...state.adrs],
    dataModel: state.dataModelSpec ?? undefined,
    apiChangeSets: [...state.apiChangeSets],
    componentComposition: stateCompositionsToBundle(state.componentCompositions),
    screenPlans: [...state.screenPlans],
    designSystemDiff: state.designSystemDiff ?? undefined,
    taskPlan,
    assumptionLedger: state.assumptionLedger!,
  };
}

// ---------------------------------------------------------------------------
// Post-processing: re-estimate token budgets via sizing heuristic
// ---------------------------------------------------------------------------

function postProcessTaskPlan(
  plan: TaskPlan,
  state: ArchitectStateType,
): TaskPlan {
  const bundle: Partial<ContractBundle> = {
    dataModel: state.dataModelSpec ?? undefined,
    apiChangeSets: [...state.apiChangeSets],
    componentComposition: stateCompositionsToBundle(state.componentCompositions),
    screenPlans: [...state.screenPlans],
    architectureSpec: state.architectureSpec ?? undefined,
  };

  const tasks = plan.tasks.map((task) => {
    const heuristicBudget = estimateTaskTokenBudget(task, bundle);
    return {
      ...task,
      estimatedTokenBudget: heuristicBudget,
    };
  });

  return { ...plan, tasks };
}

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

/** Create Node 5 — Task Planner (1 Opus call + dry-Critic + optional retry). */
export function createTaskPlanner(deps: ArchitectDeps): ArchitectNodeFn {
  return async (state: ArchitectStateType): Promise<Partial<ArchitectStateType>> => {
    debugLog('taskPlanner: ENTER');

    if (!state.architectureSpec) {
      debugLog('taskPlanner: EXIT (no architectureSpec)');
      return {};
    }
    if (!state.enrichedRequirement) {
      debugLog('taskPlanner: EXIT (no enrichedRequirement)');
      return {};
    }

    const systemPrompt = loadSystemPrompt();
    const promptVersion = getPromptVersion();
    let userMessage = buildTaskPlannerUserMessage(state);

    const taskPlan = await callLlm(deps, systemPrompt, userMessage, promptVersion);
    if (!taskPlan) return {};

    const processed = postProcessTaskPlan(taskPlan, state);

    const dryCriticReport = runDryCritic(processed, state);
    if (dryCriticReport.passed) {
      debugLog(`taskPlanner: EXIT tasks=${processed.tasks.length} dryCritic=passed`);
      return { taskPlan: processed };
    }

    debugLog(`taskPlanner: dry-Critic failed (${dryCriticReport.summary}), retrying once`);
    const feedbackSection = buildDryCriticFeedback(dryCriticReport);
    userMessage = userMessage + '\n' + feedbackSection;

    const retryPlan = await callLlm(deps, systemPrompt, userMessage, promptVersion);
    if (!retryPlan) return { taskPlan: processed };

    const retryProcessed = postProcessTaskPlan(retryPlan, state);
    const retryReport = runDryCritic(retryProcessed, state);

    if (retryReport.passed) {
      debugLog(`taskPlanner: EXIT tasks=${retryProcessed.tasks.length} dryCritic=passed (retry)`);
    } else {
      debugLog(`taskPlanner: EXIT tasks=${retryProcessed.tasks.length} dryCritic=failed (retry exhausted: ${retryReport.summary})`);
    }

    return { taskPlan: retryProcessed };
  };
}

async function callLlm(
  deps: ArchitectDeps,
  systemPrompt: string,
  userMessage: string,
  promptVersion: string | undefined,
): Promise<TaskPlan | null> {
  debugLog('taskPlanner: LLM call START (claude-opus-4-6)');
  const result = await deps.provider.complete(
    { system: systemPrompt, messages: [{ role: 'user', content: userMessage }] },
    {
      model: 'claude-opus-4-6',
      maxTokens: 8192,
      temperature: 0,
      responseSchema: TASK_PLANNER_RESPONSE_SCHEMA,
      promptVersion,
    },
  );

  debugLog(`taskPlanner: LLM call END ok=${result.ok}`);
  if (!result.ok) {
    debugLog(`taskPlanner: LLM failed ${result.error.code}`);
    return null;
  }

  let raw: unknown;
  if (result.value.structured) {
    raw = result.value.structured;
  } else {
    try {
      const cleaned = result.value.content
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
      raw = JSON.parse(cleaned);
    } catch {
      debugLog('taskPlanner: response is not valid JSON');
      return null;
    }
  }

  const parsed = TaskPlannerLlmOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    debugLog(`taskPlanner: schema validation failed: ${issues}`);
    return null;
  }

  return parsed.data;
}

function buildDryCriticFeedback(report: CriticReport): string {
  const parts: string[] = [
    '\n## Dry-Critic Feedback (fix these issues in your revised output)\n',
  ];
  for (const gate of report.gates) {
    if (!gate.passed) {
      parts.push(`### FAILED: ${gate.name}`);
      for (const finding of gate.findings) {
        parts.push(`- ${finding}`);
      }
    }
  }
  return parts.join('\n');
}

export { TaskPlannerLlmOutputSchema };
