/**
 * @module run-design-specialist
 *
 * Implementer Node 2: invokes the design pipeline for frontend/UI tasks.
 * Skipped for backend, test, and integration tasks.
 *
 * Constructs a minimal AgentContext from ImplementerDeps to call
 * runDesignPipeline from @agentforge/agents-ux. For MODIFY tasks,
 * passes existingDesignSpec for brownfield delta path (Phase 3 wiring).
 */

import { debugLog, createEventBus, createRealFs, Ok } from '@agentforge/core';
import type { AgentContext, GovernanceOutcome } from '@agentforge/core';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import { runDesignPipeline, buildPipelineInput } from '@agentforge/agents-ux';
import type { ImplementerDeps, ImplementerNodeFn } from '../../deps.js';
import type { ImplementerStateType } from '../state.js';

export function createRunDesignSpecialist(deps: ImplementerDeps): ImplementerNodeFn {
  return async (state: ImplementerStateType): Promise<Partial<ImplementerStateType>> => {
    debugLog('runDesignSpecialist: ENTER');

    if (!state.task) {
      debugLog('runDesignSpecialist: no task — skipping');
      return {};
    }

    if (state.task.type !== 'frontend') {
      debugLog(`runDesignSpecialist: task type is "${state.task.type}" — skipping design`);
      return {};
    }

    const screenId = extractScreenId(state);
    if (!screenId) {
      debugLog('runDesignSpecialist: no screen ID found in contextRefs — skipping');
      return {};
    }

    const agentContext = buildMinimalAgentContext(deps, state);

    try {
      const pipelineInput = buildPipelineInput({
        pageId: screenId,
        taskId: state.task.id,
        projectRoot: deps.projectRoot,
        agentContext,
        designTool: 'browser',
        providerString: 'claude-opus-4-6',
        existingDesignSpec: state.task.mode === 'MODIFY'
          ? state.existingDesignSpecs?.[screenId] ?? undefined
          : undefined,
      } as Parameters<typeof buildPipelineInput>[0]);

      if (!pipelineInput) {
        debugLog(`runDesignSpecialist: buildPipelineInput returned null for screen "${screenId}"`);
        return { errors: [`Design specialist: page "${screenId}" not found in pages.yaml`] };
      }

      const result = await runDesignPipeline(pipelineInput);
      if (!result.ok) {
        const errMsg = `Design specialist failed: ${result.error.message}`;
        debugLog(`runDesignSpecialist: ${errMsg}`);
        return { errors: [errMsg] };
      }

      const rawSpec = result.value.design?.spec as DesignSpecV2 | undefined;
      const spec = rawSpec ?? null;
      debugLog(`runDesignSpecialist: EXIT — spec ${spec ? `${Object.keys(spec.nodes ?? {}).length} nodes` : 'null'}`);
      return { designResult: spec };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      debugLog(`runDesignSpecialist: exception — ${msg}`);
      return { errors: [`Design specialist exception: ${msg}`] };
    }
  };
}

function extractScreenId(state: ImplementerStateType): string | null {
  if (!state.task) return null;
  const screenRef = state.task.contextRefs.find(
    (r) => r.kind === 'screenPlan' || r.kind === 'componentComposition',
  );
  return screenRef?.id ?? null;
}

function buildMinimalAgentContext(
  deps: ImplementerDeps,
  state: ImplementerStateType,
): AgentContext {
  const eventBus = createEventBus();
  const fs = createRealFs();

  return {
    taskId: state.task?.id ?? 'implementer-design',
    projectRoot: deps.projectRoot,
    eventBus,
    fs,
    runGovernance: async () => Ok({ status: 'proceed' } as GovernanceOutcome),
    resolveProvider: () => Ok(deps.provider) as ReturnType<AgentContext['resolveProvider']>,
    recordAudit: async () => {},
  };
}
