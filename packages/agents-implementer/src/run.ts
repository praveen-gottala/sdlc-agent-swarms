/**
 * @module @agentforge/agents-implementer/run
 *
 * Convenience wrapper that creates, compiles, and invokes the Implementer graph.
 * Entry point for dashboard API routes and CLI.
 * Mirrors runArchitectPipelineStream in @agentforge/agents-architect/run.
 */

import { Ok, Err, createCheckpointer, debugLog } from '@agentforge/core';
import type {
  Result,
  BaseCheckpointSaver,
  TaskNode,
  ContractBundle,
} from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { DesignSpecV2 } from '@agentforge/designspec-renderer';
import type { ImplementerDeps } from './deps.js';
import { ImplementerStateAnnotation } from './graph/state.js';
import { compileImplementerGraph } from './graph/implementer-graph.js';

type GraphState = typeof ImplementerStateAnnotation.State;

/** Input for the Implementer pipeline. */
export interface ImplementerInput {
  readonly task: TaskNode;
  readonly contractBundle: Partial<ContractBundle>;
  readonly existingDesignSpecs?: Readonly<Record<string, DesignSpecV2>>;
  readonly provider: LLMProvider;
  readonly projectRoot: string;
  readonly projectId: string;
  readonly threadId?: string;
  readonly checkpointer?: BaseCheckpointSaver;
}

/** Output from the Implementer pipeline. */
export interface ImplementerOutput {
  readonly state: GraphState;
  readonly threadId: string;
}

/** Event emitted by the streaming variant. */
export type ImplementerStreamEvent =
  | {
      readonly type: 'node-complete';
      readonly node: string;
      readonly state: Partial<GraphState>;
      readonly durationMs: number;
    }
  | { readonly type: 'complete'; readonly state: GraphState; readonly threadId: string }
  | { readonly type: 'error'; readonly error: { code: string; message: string } };

export interface ImplementerError {
  readonly code: 'GRAPH_ERROR' | 'CHECKPOINTER_ERROR';
  readonly message: string;
}

/**
 * Stream the Implementer pipeline using LangGraph's native graph.stream().
 * Yields per-node completion events. Used by dashboard API routes.
 */
export async function* runImplementerPipelineStream(
  input: ImplementerInput,
): AsyncGenerator<ImplementerStreamEvent> {
  const deps: ImplementerDeps = {
    provider: input.provider,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
  };

  let checkpointer: BaseCheckpointSaver;
  try {
    checkpointer = input.checkpointer ?? await createCheckpointer();
  } catch {
    yield {
      type: 'error',
      error: { code: 'CHECKPOINTER_ERROR', message: 'Failed to create checkpointer' },
    };
    return;
  }

  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileImplementerGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  try {
    const pipelineStart = Date.now();
    let nodeStartTime = Date.now();

    const invokeInput: Record<string, unknown> = {
      task: input.task,
      contractBundle: input.contractBundle,
      projectRoot: input.projectRoot,
    };
    if (input.existingDesignSpecs) {
      invokeInput.existingDesignSpecs = input.existingDesignSpecs;
    }

    const stream = await compiled.stream(invokeInput, {
      ...config,
      streamMode: 'updates' as const,
    });

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
    debugLog(`implementer: pipeline completed in ${(totalMs / 1000).toFixed(1)}s`);

    const graphState = await compiled.getState(config);
    yield { type: 'complete', state: graphState.values, threadId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
  }
}

/**
 * Run the Implementer pipeline end-to-end (blocking).
 * Convenience wrapper for CLI usage where streaming is not needed.
 */
export async function runImplementer(
  input: ImplementerInput,
): Promise<Result<ImplementerOutput, ImplementerError>> {
  const deps: ImplementerDeps = {
    provider: input.provider,
    projectRoot: input.projectRoot,
    projectId: input.projectId,
  };

  let checkpointer: BaseCheckpointSaver;
  try {
    checkpointer = input.checkpointer ?? await createCheckpointer();
  } catch {
    return Err({
      code: 'CHECKPOINTER_ERROR',
      message: 'Failed to create checkpointer',
    });
  }

  const threadId = input.threadId ?? crypto.randomUUID();
  const compiled = compileImplementerGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  try {
    const invokeInput: Record<string, unknown> = {
      task: input.task,
      contractBundle: input.contractBundle,
      projectRoot: input.projectRoot,
    };
    if (input.existingDesignSpecs) {
      invokeInput.existingDesignSpecs = input.existingDesignSpecs;
    }

    await compiled.invoke(invokeInput, config);
    const graphState = await compiled.getState(config);
    return Ok({ state: graphState.values, threadId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Err({ code: 'GRAPH_ERROR', message });
  }
}
