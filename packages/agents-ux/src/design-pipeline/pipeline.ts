/**
 * @module design-pipeline/pipeline
 *
 * Unified design pipeline orchestrator. Sequential node calls with caching,
 * resume, and telemetry. Orchestration logic kept narrow — cache handling
 * lives in cache.ts, state init lives in initState() below.
 */

import type { Result } from '@agentforge/core';
import { Err, Ok, resolveModelForRole, debugLog } from '@agentforge/core';
import type { PipelineInput, DesignPhaseState, NodeContext, PipelineStageError } from './types.js';
import { pipelineStageError } from './types.js';
import { researchNode, planningNode, designNode, evaluatorNode } from './nodes.js';
import { loadCachedArtifact, saveCachedArtifact } from './cache.js';
import type { PIPELINE_ARTIFACTS } from '@agentforge/core';

type ArtifactName = keyof typeof PIPELINE_ARTIFACTS;

/** Maps pipeline stage names to agent role keys for model resolution (ADR-033). */
const STAGE_ROLES: Readonly<Record<string, string>> = {
  research: 'ux_research',
  planning: 'ux_planning',
  design: 'ux_design',
  evaluator: 'ux_evaluator',
};

/** Contract defaults matching the Quality preset — recommended for new projects. */
const STAGE_DEFAULTS: Readonly<Record<string, string>> = {
  research: 'claude-sonnet-4-6',
  planning: 'claude-opus-4-7',
  design: 'claude-opus-4-6',
  evaluator: 'claude-opus-4-7',
};

const STAGES = [
  { name: 'research', fn: researchNode, cache: 'researchBrief' as ArtifactName, stateKey: 'research' as const },
  { name: 'planning', fn: planningNode, cache: 'planningSpec' as ArtifactName, stateKey: 'planning' as const },
  { name: 'design', fn: designNode, cache: 'designSpecV2' as ArtifactName, stateKey: 'design' as const },
  { name: 'evaluator', fn: evaluatorNode, cache: undefined, stateKey: 'evaluation' as const },
] as const;

const STAGE_ORDER = STAGES.map(s => s.name);

function initState(input: PipelineInput): DesignPhaseState {
  return {
    moduleId: input.moduleId, taskId: input.taskId,
    projectRoot: input.projectRoot, designTool: input.designTool,
    chromePass: input.chromePass, prdRequirements: input.prdRequirements,
    pageContext: input.pageContext, designTokensSpec: input.designTokensSpec,
    designConfig: input.designConfig, description: input.description,
    viewportWidth: input.viewportWidth, rendererTokens: input.rendererTokens,
    catalogMap: input.catalogMap, componentCatalogPrompt: input.componentCatalogPrompt,
    designSystemPrompt: input.designSystemPrompt,
  };
}

/** Unified design pipeline entry point. */
export async function runDesignPipeline(
  input: PipelineInput,
): Promise<Result<DesignPhaseState, PipelineStageError>> {
  const fs = input.agentContext.fs;

  let state = initState(input);

  const sink = input.telemetry;
  const startIdx = input.stage ? STAGE_ORDER.indexOf(input.stage as typeof STAGE_ORDER[number]) : 0;

  for (const stage of STAGES) {
    const idx = STAGE_ORDER.indexOf(stage.name);

    // Skip stages before the requested start stage
    if (idx < startIdx) {
      if (stage.cache) {
        const cached = loadCachedArtifact(fs, input.projectRoot, input.moduleId, stage.cache);
        if (cached) {
          state = { ...state, [stage.stateKey]: cached };
        }
      }
      continue;
    }

    // Resume: skip if cached artifact exists
    if (input.resume && stage.cache) {
      const cached = loadCachedArtifact(fs, input.projectRoot, input.moduleId, stage.cache);
      if (cached) {
        state = { ...state, [stage.stateKey]: cached };
        sink?.onLog(stage.name, 'info', `Loaded cached ${stage.cache} — skipping ${stage.name}`);
        continue;
      }
    }

    // Per-stage model resolution via ADR-033 priority chain
    const role = STAGE_ROLES[stage.name] ?? stage.name;
    const stageDefault = STAGE_DEFAULTS[stage.name] ?? input.providerString;
    const stageModel = resolveModelForRole(role, stageDefault, input.agentContext.manifest);
    debugLog(`[pipeline] ${stage.name}: resolved model ${stageModel} (role=${role})`);

    const stageProviderResult = input.agentContext.resolveProvider(stageModel);
    if (!stageProviderResult.ok) {
      return Err(pipelineStageError(stage.name, `Failed to resolve provider for model "${stageModel}": ${(stageProviderResult.error as { message?: string }).message ?? 'unknown'}`));
    }

    const stageCtx: NodeContext = {
      provider: stageProviderResult.value,
      agentContext: { ...input.agentContext, resolvedModel: stageModel },
      telemetry: input.telemetry,
    };

    const stageAttrs = { agentRole: stage.name, moduleId: input.moduleId, taskId: input.taskId };

    const runStage = async (): Promise<Result<DesignPhaseState, PipelineStageError>> => {
      sink?.onStageStart(stage.name, stageAttrs);

      const result = await stage.fn(state, stageCtx);

      if (!result.ok) {
        sink?.onStageFail(stage.name, (result.error as PipelineStageError).message);
        return result as Result<never, PipelineStageError>;
      }

      state = { ...state, ...result.value };

      if (stage.cache && result.value[stage.stateKey] !== undefined) {
        saveCachedArtifact(fs, input.projectRoot, input.moduleId, stage.cache, result.value[stage.stateKey]);
      }

      sink?.onStageComplete(stage.name, {});
      return Ok(state);
    };

    const stageResult = sink?.wrapStage
      ? await sink.wrapStage(stage.name, stageAttrs, runStage)
      : await runStage();

    if (!stageResult.ok) {
      return stageResult as Result<never, PipelineStageError>;
    }
  }

  return Ok(state);
}
