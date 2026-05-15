/**
 * @module @agentforge/agents-architect/run
 *
 * Convenience wrapper that creates, compiles, and invokes the Architect graph.
 * Entry point for dashboard API routes and CLI.
 * Mirrors runClarifierPipelineStream in @agentforge/agents-clarifier/run.
 */

import { Ok, Err, createCheckpointer, debugLog } from '@agentforge/core';
import type { Result, BaseCheckpointSaver, EnrichedRequirement, AssumptionLedger } from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { RetrievalTools } from '@agentforge/retrieval';
import type { ArchitectDeps } from './deps.js';
import type { RepoSnapshot } from './types.js';
import { ArchitectStateAnnotation } from './graph/state.js';
import { compileArchitectGraph } from './graph/architect-graph.js';

type GraphState = typeof ArchitectStateAnnotation.State;

/** Input for the Architect pipeline. */
export interface ArchitectInput {
  readonly enrichedRequirement: EnrichedRequirement;
  readonly assumptionLedger: AssumptionLedger;
  readonly mode?: 'greenfield' | 'brownfield';
  readonly existingRepoSnapshot?: RepoSnapshot;
  readonly provider: LLMProvider;
  readonly projectRoot: string;
  readonly projectId: string;
  readonly retrievalTools?: RetrievalTools;
  readonly threadId?: string;
  readonly checkpointer?: BaseCheckpointSaver;
  readonly baseCatalog?: string;
  /** Gate 2 decision for HITL resume. */
  readonly gate2Decision?: 'approved' | 'rejected';
  /** Gate 2 partial edits for HITL resume. */
  readonly gate2Edits?: Partial<GraphState>;
}

/** Output from the Architect pipeline. */
export interface ArchitectOutput {
  readonly state: GraphState;
  readonly threadId: string;
  readonly interrupted: boolean;
}

/** Event emitted by the streaming variant. */
export type ArchitectStreamEvent =
  | { readonly type: 'node-complete'; readonly node: string; readonly state: Partial<GraphState>; readonly durationMs: number }
  | { readonly type: 'interrupt'; readonly state: GraphState; readonly threadId: string }
  | { readonly type: 'complete'; readonly state: GraphState; readonly threadId: string }
  | { readonly type: 'error'; readonly error: { code: string; message: string } };

/**
 * Stream the Architect pipeline using LangGraph's native graph.stream().
 * Yields per-node completion events. Used by dashboard API routes.
 */
export async function* runArchitectPipelineStream(
  input: ArchitectInput,
): AsyncGenerator<ArchitectStreamEvent> {
  const deps: ArchitectDeps = {
    provider: input.provider,
    retrievalTools: input.retrievalTools,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
    baseCatalog: input.baseCatalog,
  };

  let checkpointer: BaseCheckpointSaver;
  try {
    checkpointer = input.checkpointer ?? await createCheckpointer();
  } catch {
    yield { type: 'error', error: { code: 'CHECKPOINTER_ERROR', message: 'Failed to create checkpointer' } };
    return;
  }

  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileArchitectGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  const isResume = !!(input.gate2Decision);

  try {
    const pipelineStart = Date.now();
    let nodeStartTime = Date.now();

    let stream;
    if (isResume) {
      // Resume from Gate 2 interrupt — updateState then stream(null)
      // per lessons-learned §"LangGraph Resume"
      const stateUpdate: Record<string, unknown> = {};
      if (input.gate2Decision) stateUpdate.gate2Decision = input.gate2Decision;
      if (input.gate2Edits) stateUpdate.gate2Edits = input.gate2Edits;
      await compiled.updateState(config, stateUpdate);
      stream = await compiled.stream(null, { ...config, streamMode: 'updates' as const });
    } else {
      const invokeInput: Record<string, unknown> = {
        enrichedRequirement: input.enrichedRequirement,
        assumptionLedger: input.assumptionLedger,
        mode: input.mode ?? 'greenfield',
        threadId,
      };
      if (input.existingRepoSnapshot) {
        invokeInput.existingRepoSnapshot = input.existingRepoSnapshot;
      }
      stream = await compiled.stream(invokeInput, { ...config, streamMode: 'updates' as const });
    }

    for await (const update of stream) {
      const nodeNames = Object.keys(update as Record<string, unknown>);
      for (const node of nodeNames) {
        const nodeState = (update as Record<string, unknown>)[node] as Partial<GraphState>;
        const durationMs = Date.now() - nodeStartTime;

        yield { type: 'node-complete', node, state: nodeState, durationMs };
        nodeStartTime = Date.now();
      }
    }

    const totalMs = Date.now() - pipelineStart;
    debugLog(`architect: pipeline completed in ${(totalMs / 1000).toFixed(1)}s`);

    const graphState = await compiled.getState(config);
    const interrupted = (graphState.next?.length ?? 0) > 0;

    if (interrupted) {
      yield { type: 'interrupt', state: graphState.values, threadId };
    } else {
      yield { type: 'complete', state: graphState.values, threadId };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('GraphInterrupt') || message.includes('interrupt')) {
      try {
        const graphState = await compiled.getState({ configurable: { thread_id: threadId } });
        yield { type: 'interrupt', state: graphState.values, threadId };
      } catch {
        yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
      }
      return;
    }

    yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
  }
}

export interface ArchitectError {
  readonly code: 'GRAPH_ERROR' | 'CHECKPOINTER_ERROR';
  readonly message: string;
}

/**
 * Run the Architect pipeline end-to-end (blocking).
 * Convenience wrapper for CLI usage where streaming is not needed.
 */
export async function runArchitect(
  input: ArchitectInput,
): Promise<Result<ArchitectOutput, ArchitectError>> {
  const deps: ArchitectDeps = {
    provider: input.provider,
    retrievalTools: input.retrievalTools,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
    baseCatalog: input.baseCatalog,
  };

  let checkpointer: BaseCheckpointSaver;
  try {
    checkpointer = input.checkpointer ?? await createCheckpointer();
  } catch {
    return Err({ code: 'CHECKPOINTER_ERROR', message: 'Failed to create checkpointer' });
  }

  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileArchitectGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  try {
    const isResume = !!input.gate2Decision;
    if (isResume) {
      const stateUpdate: Record<string, unknown> = {};
      if (input.gate2Decision) stateUpdate.gate2Decision = input.gate2Decision;
      if (input.gate2Edits) stateUpdate.gate2Edits = input.gate2Edits;
      await compiled.updateState(config, stateUpdate);
      await compiled.invoke(null, config);
    } else {
      const invokeInput: Record<string, unknown> = {
        enrichedRequirement: input.enrichedRequirement,
        assumptionLedger: input.assumptionLedger,
        mode: input.mode ?? 'greenfield',
        threadId,
      };
      if (input.existingRepoSnapshot) invokeInput.existingRepoSnapshot = input.existingRepoSnapshot;
      await compiled.invoke(invokeInput, config);
    }

    const graphState = await compiled.getState(config);
    const interrupted = (graphState.next?.length ?? 0) > 0;

    return Ok({ state: graphState.values, threadId, interrupted });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('GraphInterrupt') || message.includes('interrupt')) {
      const graphState = await compiled.getState(config);
      return Ok({ state: graphState.values, threadId, interrupted: true });
    }

    return Err({ code: 'GRAPH_ERROR', message });
  }
}
