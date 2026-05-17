/**
 * @module @agentforge/agents-reviewer/run
 *
 * Convenience wrapper that creates, compiles, and invokes the Reviewer graph.
 * Entry point for dashboard API routes and CLI.
 * Mirrors runImplementerPipelineStream in @agentforge/agents-implementer/run.
 */

import { Ok, Err, createCheckpointer, debugLog } from '@agentforge/core';
import type {
  Result,
  BaseCheckpointSaver,
  Diff,
  AssumptionLedger,
  ContractBundle,
  TaskCompletionReport,
  ReviewResult,
} from '@agentforge/core';
import type { LLMProvider } from '@agentforge/providers';
import type { ReviewerDeps } from './deps.js';
import { ReviewerStateAnnotation } from './graph/state.js';
import { compileReviewerGraph } from './graph/reviewer-graph.js';

type GraphState = typeof ReviewerStateAnnotation.State;

/** Input for the Reviewer pipeline. */
export interface ReviewerInput {
  readonly diff: Diff;
  readonly assumptionLedger?: AssumptionLedger;
  readonly contractBundle?: Partial<ContractBundle>;
  readonly taskCompletionReport?: TaskCompletionReport;
  readonly provider: LLMProvider;
  readonly projectRoot: string;
  readonly projectId: string;
  readonly threadId?: string;
  readonly checkpointer?: BaseCheckpointSaver;
}

/** Output from the Reviewer pipeline. */
export interface ReviewerOutput {
  readonly reviewResult: ReviewResult;
  readonly threadId: string;
}

/** Event emitted by the streaming variant. */
export type ReviewerStreamEvent =
  | {
      readonly type: 'node-complete';
      readonly node: string;
      readonly state: Partial<GraphState>;
      readonly durationMs: number;
    }
  | { readonly type: 'complete'; readonly reviewResult: ReviewResult; readonly threadId: string }
  | { readonly type: 'error'; readonly error: { code: string; message: string } };

export interface ReviewerError {
  readonly code: 'GRAPH_ERROR' | 'CHECKPOINTER_ERROR';
  readonly message: string;
}

/**
 * Stream the Reviewer pipeline using LangGraph's native graph.stream().
 * Yields per-node completion events. Used by dashboard API routes.
 */
export async function* runReviewerPipelineStream(
  input: ReviewerInput,
): AsyncGenerator<ReviewerStreamEvent> {
  const deps: ReviewerDeps = {
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
  const compiled = compileReviewerGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  try {
    const pipelineStart = Date.now();
    let nodeStartTime = Date.now();

    const invokeInput: Record<string, unknown> = {
      diff: input.diff,
    };
    if (input.assumptionLedger) {
      invokeInput.assumptionLedger = input.assumptionLedger;
    }
    if (input.contractBundle) {
      invokeInput.contractBundle = input.contractBundle;
    }
    if (input.taskCompletionReport) {
      invokeInput.taskCompletionReport = input.taskCompletionReport;
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
    debugLog(`reviewer: pipeline completed in ${(totalMs / 1000).toFixed(1)}s`);

    const graphState = await compiled.getState(config);
    const reviewResult = graphState.values.reviewResult;

    if (reviewResult) {
      yield { type: 'complete', reviewResult, threadId };
    } else {
      yield {
        type: 'error',
        error: { code: 'GRAPH_ERROR', message: 'Review completed but no ReviewResult produced' },
      };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    yield { type: 'error', error: { code: 'GRAPH_ERROR', message } };
  }
}

/**
 * Run the Reviewer pipeline end-to-end (blocking).
 * Convenience wrapper for CLI usage where streaming is not needed.
 */
export async function runReviewer(
  input: ReviewerInput,
): Promise<Result<ReviewerOutput, ReviewerError>> {
  const deps: ReviewerDeps = {
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
  const compiled = compileReviewerGraph(deps, checkpointer);
  const config = { configurable: { thread_id: threadId } };

  try {
    const invokeInput: Record<string, unknown> = {
      diff: input.diff,
    };
    if (input.assumptionLedger) {
      invokeInput.assumptionLedger = input.assumptionLedger;
    }
    if (input.contractBundle) {
      invokeInput.contractBundle = input.contractBundle;
    }
    if (input.taskCompletionReport) {
      invokeInput.taskCompletionReport = input.taskCompletionReport;
    }

    await compiled.invoke(invokeInput, config);
    const graphState = await compiled.getState(config);
    const reviewResult = graphState.values.reviewResult;

    if (!reviewResult) {
      return Err({
        code: 'GRAPH_ERROR',
        message: 'Review completed but no ReviewResult produced',
      });
    }

    return Ok({ reviewResult, threadId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return Err({ code: 'GRAPH_ERROR', message });
  }
}
