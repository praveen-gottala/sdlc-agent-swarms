/**
 * @module design-pipeline/nodes
 *
 * Pure node functions for the unified design pipeline.
 * Signatures: (state, ctx) => Promise<Result<Partial<DesignPhaseState>>>
 * These map directly to StateGraph.addNode(name, fn) for the M-3 LangGraph port.
 */

// TODO(ADR-043 M-3 / vision Layer 8): replace direct work-fn calls with
// runAgent() when governance is wired into the LangGraph port.

import type { Result } from '@agentforge/core';
import { Err } from '@agentforge/core';
import type { DesignPhaseState, NodeContext, PipelineStageError } from './types.js';
import { pipelineStageError } from './types.js';
import { uxResearchWork } from '../ux-research/ux-research.js';
import type { UXResearchInput } from '../ux-research/ux-research.js';
import { uxPlanningWork } from '../ux-planning/ux-planning.js';
import type { UXPlanningInput } from '../ux-planning/ux-planning.js';
import { penpotDesignWork } from '../ux-design/ux-penpot-design.js';
import type { PenpotDesignInput } from '../ux-design/ux-penpot-design.js';
import { browserDesignWork } from './browser-design-work.js';

/** Research stage — wraps uxResearchWork. */
export async function researchNode(
  state: DesignPhaseState,
  ctx: NodeContext,
): Promise<Result<Partial<DesignPhaseState>, PipelineStageError>> {
  const input: UXResearchInput = {
    moduleId: state.moduleId,
    taskId: state.taskId,
    prdRequirements: state.prdRequirements ?? [],
    designTokensSpec: state.designTokensSpec,
    pageContext: state.pageContext,
  };

  const result = await uxResearchWork(input, ctx.provider, [], ctx.agentContext);
  if (!result.ok) {
    const err = result.error as { message?: string };
    return Err(pipelineStageError('research', err.message ?? 'Research stage failed'));
  }
  return { ok: true, value: { research: result.value } };
}

/** Planning stage — wraps uxPlanningWork. */
export async function planningNode(
  state: DesignPhaseState,
  ctx: NodeContext,
): Promise<Result<Partial<DesignPhaseState>, PipelineStageError>> {
  if (!state.research) {
    return Err(pipelineStageError('planning', 'research output missing — run research stage first'));
  }

  const input: UXPlanningInput = {
    briefId: state.research.briefId,
    moduleId: state.moduleId,
    taskId: state.taskId,
    designBrief: state.research,
    designConfig: state.designConfig,
    pageContext: state.pageContext,
  };

  const result = await uxPlanningWork(input, ctx.provider, [], ctx.agentContext);
  if (!result.ok) {
    const err = result.error as { message?: string };
    return Err(pipelineStageError('planning', err.message ?? 'Planning stage failed'));
  }
  return { ok: true, value: { planning: result.value } };
}

/**
 * Design stage — dispatches on state.designTool.
 * Chrome Pass: mode='generate' → chromeOnly=true; mode='consume' → frozenChromeSpec/PageId.
 */
export async function designNode(
  state: DesignPhaseState,
  ctx: NodeContext,
): Promise<Result<Partial<DesignPhaseState>, PipelineStageError>> {
  if (state.designTool === 'browser') {
    return browserDesignWork(state, ctx);
  }

  if (!state.planning) {
    return Err(pipelineStageError('design', 'planning output missing — run planning stage first'));
  }

  // Penpot path — adapt state to PenpotDesignInput
  const input: PenpotDesignInput = {
    specRef: state.moduleId,
    moduleId: state.moduleId,
    taskId: state.taskId,
    planningOutput: state.planning,
    designSystemPrompt: state.designSystemPrompt,
    componentCatalogPrompt: state.componentCatalogPrompt,
    description: state.description,
    viewportWidth: state.viewportWidth,
    resolvedModel: ctx.agentContext.resolvedModel,
    useDesignSpecV2: true,
    rendererTokens: state.rendererTokens as PenpotDesignInput['rendererTokens'],
    catalogMap: state.catalogMap as PenpotDesignInput['catalogMap'],
    designTokens: state.designTokensSpec,
    pageContext: state.pageContext,
    chromeOnly: state.chromePass?.mode === 'generate',
    frozenChromeSpec: state.chromePass?.mode === 'consume' ? state.chromePass.spec : undefined,
    frozenChromePageId: state.chromePass?.mode === 'consume' ? state.chromePass.activePageId : undefined,
  };

  const traceCollector = ctx.promptTraces ? { promptTraces: ctx.promptTraces } : undefined;
  const result = await penpotDesignWork(input, ctx.provider, ctx.agentContext.mcpClient, traceCollector);
  if (!result.ok) {
    const err = result.error as { message?: string };
    return Err(pipelineStageError('design', err.message ?? 'Penpot design stage failed'));
  }

  return {
    ok: true,
    value: {
      design: {
        spec: result.value.designSpec as unknown as Record<string, unknown>,
        designToolMetadata: {
          tool: 'penpot' as const,
          ...(result.value.script ? { script: result.value.script } : {}),
          ...(result.value.penpotNodeIds ? { nodeIds: result.value.penpotNodeIds } : {}),
          ...(result.value.penpotProjectId ? { projectId: result.value.penpotProjectId } : {}),
        },
      },
    },
  };
}

/**
 * Evaluator stage — wraps evaluateDesign().
 * Second argument: JSON.stringify(state.design.spec) (DesignSpec JSON, not planning JSON).
 * Phase 5 retires the CLI's planning-JSON code path and writes the ADR.
 *
 * DEVIATION (ADR-045): Returns undefined evaluation in Phase 1. evaluateDesign()
 * requires a browser screenshot (base64) which needs an active browser session.
 * Full evaluator integration deferred to Phase 2 (execution-plan §2.x).
 */
export async function evaluatorNode(
  state: DesignPhaseState,
  ctx: NodeContext,
): Promise<Result<Partial<DesignPhaseState>, PipelineStageError>> {
  if (!state.design) {
    return Err(pipelineStageError('evaluator', 'design output missing — run design stage first'));
  }

  // Phase 1: screenshot capture requires browser session (Phase 2)
  return { ok: true, value: { evaluation: undefined } };
}
