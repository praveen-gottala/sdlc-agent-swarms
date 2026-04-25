/**
 * @module design-pipeline/pipeline
 *
 * Unified design pipeline orchestrator. Sequential node calls with caching,
 * resume, and telemetry. Orchestration logic kept narrow — cache handling
 * lives in cache.ts, state init lives in initState() below.
 */

import type { Result } from '@agentforge/core';
import { Err, Ok } from '@agentforge/core';
import type { PipelineInput, DesignPhaseState, NodeContext, PipelineStageError } from './types.js';
import { pipelineStageError } from './types.js';
import { researchNode, planningNode, designNode, evaluatorNode } from './nodes.js';
import { loadCachedArtifact, saveCachedArtifact } from './cache.js';
import type { PIPELINE_ARTIFACTS } from '@agentforge/core';

type ArtifactName = keyof typeof PIPELINE_ARTIFACTS;

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

  const providerResult = input.agentContext.resolveProvider(input.providerString);
  if (!providerResult.ok) {
    return Err(pipelineStageError('init', `Failed to resolve provider "${input.providerString}": ${(providerResult.error as { message?: string }).message ?? 'unknown'}`));
  }

  let state = initState(input);
  const ctx: NodeContext = {
    provider: providerResult.value,
    agentContext: input.agentContext,
    telemetry: input.telemetry,
    promptTraces: [],
  };

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

    sink?.onStageStart(stage.name, { agentRole: stage.name, moduleId: input.moduleId, taskId: input.taskId });

    const result = await stage.fn(state, ctx);

    if (!result.ok) {
      sink?.onStageFail(stage.name, (result.error as PipelineStageError).message);
      return result as Result<never, PipelineStageError>;
    }

    state = { ...state, ...result.value };

    // Cache stage output
    if (stage.cache && result.value[stage.stateKey] !== undefined) {
      saveCachedArtifact(fs, input.projectRoot, input.moduleId, stage.cache, result.value[stage.stateKey]);
    }

    sink?.onStageComplete(stage.name, {});
  }

  return Ok(state);
}
